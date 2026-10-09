import { randomUUID } from 'node:crypto'
import type { CaptureSource, ChatMessage, QueryEvent, UsageInfo } from '@shared/types'
import type { ConfigStore } from '../store'
import type { HistoryStore } from './history'
import { AIError, streamChat } from '../ai/client'
import type { CaptureResult } from './selection'

const MAX_INPUT_CHARS = 10000

export interface SessionDeps {
  store: ConfigStore
  history: HistoryStore
  emit: (event: QueryEvent) => void
}

/**
 * One quick-look conversation: first question + follow-ups.
 * Owns the request lifecycle (streaming, abort, retries) and the
 * message history for context.
 */
export class QuerySession {
  readonly id = randomUUID()
  readonly source: CaptureSource
  readonly sourceText: string

  private messages: ChatMessage[] = []
  private controller: AbortController | null = null
  private seq = 0
  private currentReqId = ''
  /** Last answer accumulated for the in-flight request. */
  private answer = ''
  private reasoning = ''
  private disposed = false
  private started = false
  /** Initial text of the whole session (for history). */
  private initialText = ''
  private rawTextLength: number
  /** Last question that failed or was aborted — used by regenerate(). */
  private pendingQuestion: string | null = null

  constructor(
    private deps: SessionDeps,
    capture: CaptureResult
  ) {
    this.source = capture.source
    this.rawTextLength = capture.text.length
    this.sourceText =
      capture.text.length > MAX_INPUT_CHARS ? capture.text.slice(0, MAX_INPUT_CHARS) : capture.text
  }

  get truncated(): boolean {
    return this.rawTextLength > MAX_INPUT_CHARS
  }

  /** Kick off automatically when text was captured. */
  async start(): Promise<void> {
    if (!this.sourceText) return
    this.started = true
    this.initialText = this.sourceText
    await this.run(this.wrap(this.sourceText))
  }

  /** User typed something manually (no capture) — becomes the first question. */
  async submit(text: string): Promise<void> {
    const t = text.trim()
    if (!t) return
    if (!this.started) {
      this.started = true
      this.initialText = t
      await this.run(this.wrap(t))
    } else {
      await this.run(t)
    }
  }

  async regenerate(): Promise<void> {
    if (this.disposed) return
    // Strip trailing assistant messages from the previous attempt.
    while (this.messages.length && this.messages[this.messages.length - 1].role !== 'user') {
      this.messages.pop()
    }
    let content = this.pendingQuestion
    const last = this.messages[this.messages.length - 1]
    if (last?.role === 'user') {
      content = this.messages.pop()!.content
    }
    if (!content) return
    this.pendingQuestion = null
    await this.run(content)
  }

  stop(): void {
    this.controller?.abort()
  }

  dispose(): void {
    this.disposed = true
    this.controller?.abort()
    this.controller = null
  }

  /* ------------------------------ internals ------------------------------ */

  /** Move an unanswered trailing user message aside so a retry can resend it. */
  private parkDanglingQuestion(): void {
    const tail = this.messages[this.messages.length - 1]
    if (tail?.role === 'user') {
      this.pendingQuestion = this.messages.pop()!.content
    }
  }

  private wrap(text: string): string {
    const cfg = this.deps.store.get()
    const prompt = cfg.prompts.find((p) => p.id === cfg.activePromptId) ?? cfg.prompts[0]
    const tpl = prompt?.template || '{{text}}'
    if (tpl.includes('{{text}}')) return tpl.replaceAll('{{text}}', text)
    return text
  }

  private async run(userContent: string): Promise<void> {
    if (this.disposed) return
    const cfg = this.deps.store.get()
    const provider = cfg.providers.find((p) => p.id === cfg.activeProviderId)
    const model = cfg.activeModelId
    const reqId = `r${++this.seq}`
    this.currentReqId = reqId
    this.answer = ''
    this.reasoning = ''

    const fail = (message: string, detail?: string): void => {
      // Keep the raw server detail in the local log only; renderer gets the friendly code.
      if (detail) console.error('[askthis] ai error detail:', detail)
      this.deps.emit({ type: 'error', requestId: reqId, message })
    }

    if (!provider || !provider.baseUrl) {
      // remember the question so the "Retry" button can resend it later
      this.pendingQuestion = userContent
      fail('NO_PROVIDER')
      return
    }
    const apiKey = this.deps.store.getApiKey(provider.id)
    const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?=[:/]|$)/i.test(provider.baseUrl)
    if (!apiKey && !isLocal) {
      this.pendingQuestion = userContent
      fail('NO_API_KEY')
      return
    }

    // A dangling user message can only be left over from an interrupted
    // attempt — keep the conversation strictly alternating (user/assistant).
    this.parkDanglingQuestion()
    this.messages.push({ role: 'user', content: userContent })

    const prompt = cfg.prompts.find((p) => p.id === cfg.activePromptId) ?? cfg.prompts[0]
    const requestMessages: ChatMessage[] = []
    if (prompt?.system) requestMessages.push({ role: 'system', content: prompt.system })
    requestMessages.push(...this.messages)

    const ctrl = new AbortController()
    this.controller?.abort()
    this.controller = ctrl

    this.deps.emit({ type: 'start', requestId: reqId, model: model || '(default)' })
    const t0 = Date.now()

    try {
      const result = await streamChat({
        provider,
        apiKey,
        model,
        messages: requestMessages,
        reasoningLevel: cfg.reasoningLevel,
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
        timeoutSec: cfg.requestTimeoutSec,
        signal: ctrl.signal,
        onDelta: (channel, delta) => {
          if (this.disposed || this.currentReqId !== reqId) return
          if (channel === 'text') this.answer += delta
          else this.reasoning += delta
          this.deps.emit({ type: 'delta', requestId: reqId, channel, delta })
        }
      })

      if (this.disposed || this.currentReqId !== reqId) return

      this.messages.push({ role: 'assistant', content: this.answer })
      if (result.incomplete && this.answer) {
        // connection dropped mid-answer — keep what we have, mark it
        this.answer += '\n\n…（连接中断，回答可能不完整）'
        this.deps.emit({
          type: 'delta',
          requestId: reqId,
          channel: 'text',
          delta: '\n\n…（连接中断，回答可能不完整）'
        })
      }
      this.deps.emit({
        type: 'done',
        requestId: reqId,
        elapsedMs: Date.now() - t0,
        usage: result.usage
      })

      if (cfg.historyEnabled && this.answer) {
        this.deps.history.add(
          {
            id: randomUUID(),
            ts: Date.now(),
            source: this.source,
            question: this.initialText || userContent,
            answer: this.answer,
            model
          },
          cfg.historyLimit
        )
      }
    } catch (err) {
      if (this.disposed || this.currentReqId !== reqId) return
      if (ctrl.signal.aborted && err instanceof Error && err.name === 'AbortError') {
        this.parkDanglingQuestion()
        this.deps.emit({ type: 'aborted', requestId: reqId })
        return
      }
      // keep the question around so "retry" can resend it cleanly
      this.parkDanglingQuestion()
      if (err instanceof AIError) {
        fail(err.message, err.detail)
      } else if (err instanceof Error && err.name === 'TimeoutError') {
        fail('TIMEOUT')
      } else {
        fail(err instanceof Error ? err.message : String(err))
      }
    } finally {
      if (this.controller === ctrl) this.controller = null
    }
  }
}
