import { randomUUID } from 'node:crypto'
import type { CaptureSource, ChatMessage, HistoryEntry, HistoryTurn, QueryEvent } from '@shared/types'
import type { ConfigStore } from '../store'
import type { HistoryStore } from './history'
import { AIError, streamChat } from '../ai/client'
import { sleep } from '../utils/fs'
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
  readonly id: string
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
  /** 已完成轮次的原始提问与回答，用于按会话聚合持久化历史 */
  private historyTurns: HistoryTurn[] = []
  private currentDisplayQuestion = ''
  private isRegenerating = false

  constructor(
    private deps: SessionDeps,
    capture: CaptureResult,
    sessionId?: string
  ) {
    this.id = sessionId || randomUUID()
    this.source = capture.source
    this.rawTextLength = capture.text.length
    this.sourceText =
      capture.text.length > MAX_INPUT_CHARS ? capture.text.slice(0, MAX_INPUT_CHARS) : capture.text
  }

  /** 从历史记录恢复可继续追问的会话上下文 */
  static fromHistory(deps: SessionDeps, entry: HistoryEntry): QuerySession {
    const turns =
      entry.turns && entry.turns.length > 0
        ? entry.turns
        : [{ q: entry.question, a: entry.answer }]
    const source: CaptureSource =
      entry.source === 'selection' || entry.source === 'clipboard' || entry.source === 'none'
        ? entry.source
        : 'none'
    const session = new QuerySession(
      deps,
      { text: entry.question || turns[0]?.q || '', source },
      entry.sessionId || entry.id
    )
    session.started = true
    session.initialText = entry.question || turns[0]?.q || ''
    session.historyTurns = turns.map((t) => ({ q: t.q, a: t.a }))
    for (const t of turns) {
      if (t.q) session.messages.push({ role: 'user', content: t.q })
      if (t.a) session.messages.push({ role: 'assistant', content: t.a })
    }
    session.currentDisplayQuestion = turns[turns.length - 1]?.q ?? session.initialText
    return session
  }

  get truncated(): boolean {
    return this.rawTextLength > MAX_INPUT_CHARS
  }

  /** Kick off automatically when text was captured. */
  async start(): Promise<void> {
    if (!this.sourceText) return
    this.started = true
    this.initialText = this.sourceText
    await this.run(this.wrap(this.sourceText), this.sourceText)
  }

  /** User typed something manually (no capture) — becomes the first question. */
  async submit(text: string): Promise<void> {
    const t = text.trim()
    if (!t) return
    if (!this.started) {
      this.started = true
      this.initialText = t
      await this.run(this.wrap(t), t)
    } else {
      await this.run(t, t)
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
    this.isRegenerating = true
    const displayQ =
      this.currentDisplayQuestion ||
      (this.historyTurns.length > 0 ? this.historyTurns[this.historyTurns.length - 1].q : this.initialText || content)
    await this.run(content, displayQ)
  }

  /** 在快速切换模型/提示词/推理强度后，以最新配置重新生成当前或首轮回答 */
  async requeryWithCurrentConfig(): Promise<void> {
    if (this.disposed) return
    if (!this.started) {
      if (this.sourceText) await this.start()
      return
    }
    const userMsgCount = this.messages.filter((m) => m.role === 'user').length
    if (userMsgCount <= 1 && this.historyTurns.length <= 1 && this.initialText) {
      this.messages = []
      this.pendingQuestion = null
      this.isRegenerating = this.historyTurns.length > 0
      await this.run(this.wrap(this.initialText), this.initialText)
      return
    }
    await this.regenerate()
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

  private async run(userContent: string, displayQuestion?: string): Promise<void> {
    if (this.disposed) return
    const cfg = this.deps.store.get()
    const provider = cfg.providers.find((p) => p.id === cfg.activeProviderId)
    const model = cfg.activeModelId
    const reqId = `r${++this.seq}`
    this.currentReqId = reqId
    this.answer = ''
    this.reasoning = ''
    const questionLabel = displayQuestion ?? (this.currentDisplayQuestion || userContent)
    this.currentDisplayQuestion = questionLabel
    const wasRegenerating = this.isRegenerating
    this.isRegenerating = false

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
    if (!model || !model.trim()) {
      this.pendingQuestion = userContent
      fail('NO_MODEL')
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
    let receivedDelta = false

    try {
      let result: Awaited<ReturnType<typeof streamChat>> | null = null
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          result = await streamChat({
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
              receivedDelta = true
              if (channel === 'text') this.answer += delta
              else this.reasoning += delta
              this.deps.emit({ type: 'delta', requestId: reqId, channel, delta })
            }
          })
          break
        } catch (err) {
          // 仅在尚未收到任何输出且属于瞬时可重试错误时自动轻重试一次
          if (
            attempt === 0 &&
            err instanceof AIError &&
            err.retryable &&
            !receivedDelta &&
            !ctrl.signal.aborted &&
            !this.disposed
          ) {
            await sleep(600)
            if (ctrl.signal.aborted || this.disposed || this.currentReqId !== reqId) return
            continue
          }
          throw err
        }
      }
      if (!result) return

      if (this.disposed || this.currentReqId !== reqId) return

      this.messages.push({ role: 'assistant', content: this.answer })
      const incomplete = Boolean(result.incomplete && this.answer)
      this.deps.emit({
        type: 'done',
        requestId: reqId,
        elapsedMs: Date.now() - t0,
        usage: result.usage,
        incomplete
      })

      if (cfg.historyEnabled && this.answer) {
        const turnRecord: HistoryTurn = { q: questionLabel, a: this.answer }
        if (wasRegenerating && this.historyTurns.length > 0) {
          this.historyTurns[this.historyTurns.length - 1] = turnRecord
        } else {
          this.historyTurns.push(turnRecord)
        }
        this.deps.history.upsertBySession(
          {
            id: this.id,
            sessionId: this.id,
            ts: Date.now(),
            source: this.source,
            question: this.initialText || questionLabel,
            answer: this.answer,
            model,
            turns: this.historyTurns.map((x) => ({ ...x })),
            promptId: prompt?.id,
            promptName: prompt?.name
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
        fail(err.code || err.message, err.detail || err.message)
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
