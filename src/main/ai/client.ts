import { net } from 'electron'
import type {
  ChatMessage,
  FetchModelsResult,
  ModelInfo,
  ProviderConfig,
  ReasoningLevel,
  ReasoningStyle,
  TestResult,
  UsageInfo
} from '@shared/types'

export class AIError extends Error {
  constructor(
    message: string,
    public readonly detail?: string
  ) {
    super(message)
    this.name = 'AIError'
  }
}

export interface StreamOptions {
  provider: ProviderConfig
  apiKey?: string
  model: string
  messages: ChatMessage[]
  reasoningLevel: ReasoningLevel
  temperature: number | null
  maxTokens: number
  timeoutSec: number
  signal?: AbortSignal
  onDelta: (channel: 'text' | 'reasoning', delta: string) => void
}

export interface StreamResult {
  usage?: UsageInfo
  /** True when the stream ended without a proper stop marker (connection dropped). */
  incomplete?: boolean
}

/* ============================== public API ============================== */

export async function streamChat(opts: StreamOptions): Promise<StreamResult> {
  const { provider } = opts
  const signal = combineSignals(opts.signal, opts.timeoutSec)
  return provider.kind === 'anthropic'
    ? streamAnthropic(opts, signal)
    : streamOpenAICompatible(opts, signal)
}

export async function testProvider(
  provider: ProviderConfig,
  apiKey: string | undefined,
  model: string,
  timeoutSec = 20
): Promise<TestResult> {
  const started = Date.now()
  try {
    if (provider.kind === 'anthropic') {
      const res = await postJson(
        anthropicUrl(provider.baseUrl, 'messages'),
        anthropicHeaders(provider, apiKey),
        {
          model,
          max_tokens: 32,
          messages: [{ role: 'user', content: 'Say "ok" in one word.' }]
        },
        combineSignals(undefined, timeoutSec)
      )
      const json = (await res.json()) as any
      const sample: string = json.content?.[0]?.text ?? ''
      return { ok: true, message: 'OK', latencyMs: Date.now() - started, sample: sample.slice(0, 80) }
    }

    const body: Record<string, unknown> = {
      model,
      messages: [{ role: 'user', content: 'Say "ok" in one word.' }],
      stream: false,
      ...maxTokensField(provider, 32)
    }
    const res = await postJson(
      openaiUrl(provider.baseUrl, 'chat/completions'),
      openaiHeaders(provider, apiKey),
      body,
      combineSignals(undefined, timeoutSec)
    )
    const json = (await res.json()) as any
    const sample: string = json.choices?.[0]?.message?.content ?? ''
    return {
      ok: true,
      message: 'OK',
      latencyMs: Date.now() - started,
      sample: sample.slice(0, 80)
    }
  } catch (err) {
    return { ok: false, message: errorMessage(err), latencyMs: Date.now() - started }
  }
}

export async function fetchModels(
  provider: ProviderConfig,
  apiKey: string | undefined,
  timeoutSec = 20
): Promise<FetchModelsResult> {
  try {
    const url =
      provider.kind === 'anthropic'
        ? anthropicUrl(provider.baseUrl, 'models')
        : openaiUrl(provider.baseUrl, 'models')
    const headers = provider.kind === 'anthropic' ? anthropicHeaders(provider, apiKey) : openaiHeaders(provider, apiKey)
    const res = await net.fetch(url, {
      method: 'GET',
      headers,
      signal: combineSignals(undefined, timeoutSec)
    })
    if (!res.ok) {
      const detail = await safeReadText(res)
      throw new AIError(`HTTP ${res.status}`, detail)
    }
    const json = (await res.json()) as any
    const list: any[] = Array.isArray(json.data) ? json.data : []
    const models: ModelInfo[] = list
      .map((m) => (typeof m?.id === 'string' ? m.id : typeof m?.name === 'string' ? m.name : null))
      .filter((id): id is string => !!id)
      .filter((id) => !isNonChatModel(id))
      .sort()
      .map((id) => ({ id }))
    return { ok: true, models }
  } catch (err) {
    return { ok: false, models: [], message: errorMessage(err) }
  }
}

/* ============================== OpenAI-compatible streaming ============================== */

async function streamOpenAICompatible(opts: StreamOptions, signal: AbortSignal): Promise<StreamResult> {
  const { provider, apiKey, model, messages, reasoningLevel, temperature, maxTokens } = opts

  const body: Record<string, unknown> = {
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
    ...(temperature != null ? { temperature } : {}),
    ...maxTokensField(provider, maxTokens)
  }
  if (modelSupportsReasoning(provider, model)) {
    applyOpenAIReasoning(body, provider.reasoningStyle, reasoningLevel, model, provider)
  }

  const res = await requestStream(
    openaiUrl(provider.baseUrl, 'chat/completions'),
    openaiHeaders(provider, apiKey),
    body,
    signal
  )

  let usage: UsageInfo | undefined
  let sawStopMarker = false
  let receivedAny = false

  for await (const line of readSSE(res)) {
    if (!line.startsWith('data:')) continue
    const payload = line.slice(5).trim()
    if (!payload) continue
    if (payload === '[DONE]') {
      sawStopMarker = true
      continue
    }
    let json: any
    try {
      json = JSON.parse(payload)
    } catch {
      continue
    }
    if (json.error) {
      throw new AIError(json.error.message ?? 'API error', JSON.stringify(json.error).slice(0, 500))
    }
    const choice = json.choices?.[0]
    const delta = choice?.delta ?? choice?.message
    if (delta) {
      const rc = delta.reasoning_content ?? delta.reasoning
      if (typeof rc === 'string' && rc) {
        receivedAny = true
        opts.onDelta('reasoning', rc)
      }
      const content = delta.content
      if (typeof content === 'string' && content) {
        receivedAny = true
        opts.onDelta('text', content)
      }
    }
    if (choice?.finish_reason) sawStopMarker = true
    if (json.usage) usage = normalizeUsage(json.usage)
  }

  return { usage, incomplete: !sawStopMarker && receivedAny }
}

/* ============================== Anthropic streaming ============================== */

async function streamAnthropic(opts: StreamOptions, signal: AbortSignal): Promise<StreamResult> {
  const { provider, apiKey, model, reasoningLevel, temperature, maxTokens } = opts

  const system = opts.messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n')
  const chat = opts.messages.filter((m) => m.role !== 'system')

  const body: Record<string, unknown> = {
    model,
    messages: chat.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: maxTokens,
    stream: true
  }
  if (system) body.system = system
  if (temperature != null) body.temperature = temperature
  if (modelSupportsReasoning(provider, model)) {
    applyAnthropicThinking(body, provider.reasoningStyle, reasoningLevel, model, provider)
  }

  const res = await requestStream(
    anthropicUrl(provider.baseUrl, 'messages'),
    anthropicHeaders(provider, apiKey),
    body,
    signal
  )

  const usage: UsageInfo = {}
  let sawStopMarker = false
  let receivedAny = false

  for await (const line of readSSE(res)) {
    if (!line.startsWith('data:')) continue
    const payload = line.slice(5).trim()
    if (!payload) continue
    let json: any
    try {
      json = JSON.parse(payload)
    } catch {
      continue
    }
    switch (json.type) {
      case 'message_start': {
        const u = json.message?.usage
        if (u) {
          usage.promptTokens = u.input_tokens
        }
        break
      }
      case 'content_block_delta': {
        const d = json.delta
        if (d?.type === 'text_delta' && typeof d.text === 'string') {
          receivedAny = true
          opts.onDelta('text', d.text)
        } else if (d?.type === 'thinking_delta' && typeof d.thinking === 'string') {
          receivedAny = true
          opts.onDelta('reasoning', d.thinking)
        }
        break
      }
      case 'message_delta': {
        const u = json.usage
        if (u) usage.completionTokens = u.output_tokens
        if (json.delta?.stop_reason) sawStopMarker = true
        break
      }
      case 'message_stop':
        sawStopMarker = true
        break
      case 'error':
        throw new AIError(json.error?.message ?? 'API error', JSON.stringify(json.error).slice(0, 500))
    }
  }

  return { usage, incomplete: !sawStopMarker && receivedAny }
}

/* ============================== request helpers ============================== */

async function requestStream(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  signal: AbortSignal
): Promise<Response> {
  let res: Response
  try {
    res = await net.fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal
    })
  } catch (err) {
    throw toNetworkError(err, signal)
  }
  if (!res.ok) {
    const detail = await safeReadText(res)
    let message = `HTTP ${res.status}`
    try {
      const parsed = JSON.parse(detail)
      message = String(parsed?.error?.message ?? parsed?.message ?? message).slice(0, 300)
    } catch {
      /* keep the HTTP code */
    }
    throw new AIError(message, detail.slice(0, 800))
  }
  if (!res.body) throw new AIError('Empty response body')
  return res
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  signal: AbortSignal
): Promise<Response> {
  let res: Response
  try {
    res = await net.fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    })
  } catch (err) {
    throw toNetworkError(err, signal)
  }
  if (!res.ok) {
    const detail = await safeReadText(res)
    let message = `HTTP ${res.status}`
    try {
      const parsed = JSON.parse(detail)
      message = String(parsed?.error?.message ?? parsed?.message ?? message).slice(0, 300)
    } catch {
      /* keep the HTTP code */
    }
    throw new AIError(message, detail.slice(0, 800))
  }
  return res
}

function toNetworkError(err: unknown, signal: AbortSignal): Error {
  if (signal.aborted) {
    const reason = (signal.reason ?? err) as any
    if (reason?.name === 'TimeoutError') return new AIError('request timed out')
    const e = new Error('aborted')
    e.name = 'AbortError'
    return e
  }
  const msg = err instanceof Error ? err.message : String(err)
  return new AIError(msg)
}

/** Merge a user abort signal with a timeout into one signal. */
function combineSignals(user: AbortSignal | undefined, timeoutSec: number): AbortSignal {
  const timeout = AbortSignal.timeout(Math.max(1, timeoutSec) * 1000)
  return user ? AbortSignal.any([user, timeout]) : timeout
}

/** Yields raw SSE lines (`data: ...`) from a streaming response. */
async function* readSSE(res: Response): AsyncGenerator<string> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).replace(/\r$/, '')
        buf = buf.slice(idx + 1)
        if (line.trim()) yield line
      }
    }
    if (buf.trim()) yield buf.trim()
  } finally {
    try {
      await reader.cancel()
    } catch {
      /* ignore */
    }
    try {
      reader.releaseLock()
    } catch {
      /* ignore */
    }
  }
}

/* ============================== URLs & headers ============================== */

function trimBase(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

function openaiUrl(baseUrl: string, path: string): string {
  const base = trimBase(baseUrl)
  if (base.endsWith(`/${path}`)) return base
  return `${base}/${path}`
}

function anthropicUrl(baseUrl: string, path: string): string {
  const base = trimBase(baseUrl)
  if (base.endsWith(`/${path}`)) return base
  if (/\/v\d+$/.test(base)) return `${base}/${path}`
  return `${base}/v1/${path}`
}

function openaiHeaders(provider: ProviderConfig, apiKey: string | undefined): Record<string, string> {
  const headers: Record<string, string> = { 'User-Agent': 'AskThis/1.0' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  for (const [k, v] of Object.entries(provider.customHeaders ?? {})) {
    if (k.trim()) headers[k.trim()] = String(v)
  }
  return headers
}

function anthropicHeaders(provider: ProviderConfig, apiKey: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'AskThis/1.0',
    'anthropic-version': '2023-06-01'
  }
  if (apiKey) headers['x-api-key'] = apiKey
  for (const [k, v] of Object.entries(provider.customHeaders ?? {})) {
    if (k.trim()) headers[k.trim()] = String(v)
  }
  return headers
}

function maxTokensField(provider: ProviderConfig, maxTokens: number): Record<string, number> {
  // Official OpenAI requires max_completion_tokens for its newer models;
  // the rest of the ecosystem still speaks max_tokens.
  if (provider.kind === 'openai-compatible' && /api\.openai\.com/i.test(provider.baseUrl)) {
    return { max_completion_tokens: maxTokens }
  }
  return { max_tokens: maxTokens }
}

/* ============================== reasoning mapping ============================== */

/** True unless the model is explicitly marked as not supporting a level. */
function modelSupportsReasoning(provider: ProviderConfig, model: string): boolean {
  const info = provider.models.find((m) => m.id === model)
  return info?.reasoning !== false
}

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host.toLowerCase()
  } catch {
    return ''
  }
}

/**
 * Map the app's level onto the provider's accepted reasoning values.
 * Value sets verified against official docs (2026-10):
 * - deepseek: low | high | max (medium→high)
 * - gemini:   low | medium | high (max→high; 3.7/3.8 reject minimal)
 * - kimi:     low | high | max (medium→high)
 * - glm:      low | high | max (medium→high)
 * - xai:      low | medium | high | xhigh (max→xhigh)
 * - siliconflow: high | max (low/medium→high)
 * - default (openai / anthropic / others): low | medium | high | max
 */
function effortValue(level: Exclude<ReasoningLevel, 'off'>, baseUrl: string): string {
  const host = hostOf(baseUrl)
  if (host.includes('deepseek')) return { low: 'low', medium: 'high', high: 'high', max: 'max' }[level]
  if (host.includes('googleapis')) return { low: 'low', medium: 'medium', high: 'high', max: 'high' }[level]
  if (host.includes('moonshot') || host.includes('kimi'))
    return { low: 'low', medium: 'high', high: 'high', max: 'max' }[level]
  if (host.includes('bigmodel')) return { low: 'low', medium: 'high', high: 'high', max: 'max' }[level]
  if (host.includes('x.ai')) return { low: 'low', medium: 'medium', high: 'high', max: 'xhigh' }[level]
  if (host.includes('siliconflow')) return { low: 'high', medium: 'high', high: 'high', max: 'max' }[level]
  return { low: 'low', medium: 'medium', high: 'high', max: 'max' }[level]
}

/** Resolve "auto" into a concrete style based on the provider. */
function effectiveStyle(style: ReasoningStyle, provider: ProviderConfig): ReasoningStyle {
  if (style !== 'auto') return style
  if (provider.kind === 'anthropic') return 'anthropic'
  const host = hostOf(provider.baseUrl)
  if (host.includes('anthropic')) return 'anthropic'
  if (host.includes('openrouter')) return 'openrouter'
  if (host.includes('deepseek')) return 'deepseek'
  return 'effort'
}

function applyOpenAIReasoning(
  body: Record<string, unknown>,
  style: ReasoningStyle,
  level: ReasoningLevel,
  model: string,
  provider: ProviderConfig
): void {
  const effective = effectiveStyle(style, provider)
  if (effective === 'none' || effective === 'anthropic') return

  if (level === 'off') {
    if (effective === 'deepseek') {
      body.thinking = { type: 'disabled' }
    }
    return
  }

  const value = effortValue(level, provider.baseUrl)
  if (effective === 'openrouter') {
    // OpenRouter's unified reasoning object
    body.reasoning = { effort: value }
    return
  }
  body.reasoning_effort = value
}

function applyAnthropicThinking(
  body: Record<string, unknown>,
  style: ReasoningStyle,
  level: ReasoningLevel,
  model: string,
  provider: ProviderConfig
): void {
  const effective = effectiveStyle(style, provider)
  if (effective === 'none' || level === 'off') return
  // 2026 API: adaptive thinking + output_config.effort (budget_tokens retired).
  body.thinking = { type: 'adaptive' }
  body.output_config = { effort: effortValue(level, provider.baseUrl) }
}

function normalizeUsage(u: any): UsageInfo {
  return {
    promptTokens: u.prompt_tokens,
    completionTokens: u.completion_tokens,
    totalTokens: u.total_tokens,
    reasoningTokens: u.completion_tokens_details?.reasoning_tokens
  }
}

/* ============================== misc ============================== */

function isNonChatModel(id: string): boolean {
  return /embed|whisper|tts|dall-e|davinci|babbage|moderation|audio|realtime|image|transcribe|speech/i.test(id)
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof AIError) return err.message
  if (err instanceof Error) {
    if (err.name === 'TimeoutError') return 'request timed out'
    return err.message
  }
  return String(err)
}
