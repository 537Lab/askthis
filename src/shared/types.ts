/**
 * AskThis — shared types used by main, preload and renderer.
 * Keep this file free of any Electron / Node imports.
 */

/* ============================== General ============================== */

export type LocalePref = 'system' | 'zh-CN' | 'en-US'
export type ThemePref = 'system' | 'light' | 'dark'
export type SelectionMode = 'auto' | 'clipboard' | 'manual'

/* ============================== Providers ============================== */

export type ProviderKind = 'openai-compatible' | 'anthropic'

/** How the reasoning level is translated into request parameters. */
export type ReasoningStyle =
  | 'auto'
  | 'effort'        // reasoning_effort field (OpenAI / Gemini / Kimi / GLM / xAI / SiliconFlow), value mapped per provider
  | 'deepseek'      // reasoning_effort (low|high|max) + thinking: { type: disabled } when off
  | 'anthropic'     // thinking: { type: adaptive } + output_config.effort
  | 'openrouter'    // reasoning: { effort: ... } (OpenRouter's unified object)
  | 'none'          // never send reasoning parameters

export interface ModelInfo {
  /** Exact model id sent to the API. */
  id: string
  /** Optional display label. */
  label?: string
  /** Whether the model supports a reasoning level control. */
  reasoning?: boolean
  /** Optional context window size (tokens), informational only. */
  contextWindow?: number
}

export interface ProviderConfig {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  /** Extra headers (rarely needed — some gateways require them). */
  customHeaders?: Record<string, string>
  models: ModelInfo[]
  reasoningStyle: ReasoningStyle
}

/** Provider as sent to the renderer — secrets are masked. */
export interface PublicProvider extends ProviderConfig {
  hasKey: boolean
  /** e.g. "sk-1…cdef" — enough to recognise a key, useless to steal. */
  keyHint: string
}

export interface ProviderPreset {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  reasoningStyle: ReasoningStyle
  /** Suggested starting models. */
  models: ModelInfo[]
  /** Extra headers the preset requires (usually empty). */
  headers?: Record<string, string>
  /** Shown in the "add provider" flow. */
  docsUrl?: string
  requiresKey: boolean
}

/* ============================== Prompts ============================== */

export interface PromptPreset {
  id: string
  name: string
  /** System prompt sent with every request of this preset. */
  system: string
  /**
   * Template that wraps the captured text. Use {{text}} as the placeholder.
   * If the template does not contain {{text}}, the raw text is sent as-is.
   */
  template: string
  builtin?: boolean
}

/* ============================== Config ============================== */

export type ReasoningLevel = 'off' | 'low' | 'medium' | 'high' | 'max'

export interface AppConfig {
  version: number
  /* General */
  locale: LocalePref
  theme: ThemePref
  launchAtLogin: boolean
  /* Interaction */
  shortcut: string
  selectionMode: SelectionMode
  /** In auto mode, fall back to the clipboard when nothing is selected. */
  clipboardFallback: boolean
  hideOnBlur: boolean
  windowWidth: number
  maxWindowHeight: number
  /* Model & request */
  providers: ProviderConfig[]
  activeProviderId: string
  activeModelId: string
  reasoningLevel: ReasoningLevel
  temperature: number | null
  maxTokens: number
  showReasoning: boolean
  requestTimeoutSec: number
  /* Prompts */
  prompts: PromptPreset[]
  activePromptId: string
  /* Privacy */
  historyEnabled: boolean
  historyLimit: number
  /**
   * Allow storing API keys as plaintext when the OS keychain is unavailable.
   * Off by default — keys are simply not persisted in that case.
   */
  allowPlaintextSecrets: boolean
}

export interface SecurityStatus {
  /** Whether the OS provides secure key storage (Keychain / DPAPI / keyring). */
  encryptionAvailable: boolean
  /** Whether the user opted in to plaintext key storage as a fallback. */
  plaintextAllowed: boolean
}

/** Config sent to the renderer (providers carry masked secrets). */
export type PublicConfig = Omit<AppConfig, 'providers'> & {
  providers: PublicProvider[]
  security: SecurityStatus
}

/* ============================== Chat ============================== */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/* ============================== IPC payloads ============================== */

export type CaptureSource = 'selection' | 'clipboard' | 'none'

export interface ActivatePayload {
  /** Text captured from the front app / clipboard (may be empty). */
  text: string
  source: CaptureSource
  /** True when a query should start immediately (text was captured). */
  autoQuery: boolean
  /** macOS: Accessibility permission is missing — show the grant UI. */
  needsPermission?: boolean
  /** The captured text was truncated to the input limit. */
  truncated?: boolean
}

export interface UsageInfo {
  promptTokens?: number
  completionTokens?: number
  reasoningTokens?: number
  totalTokens?: number
}

export type QueryEvent =
  | { type: 'start'; requestId: string; model: string }
  | { type: 'delta'; requestId: string; channel: 'text' | 'reasoning'; delta: string }
  | { type: 'done'; requestId: string; elapsedMs: number; usage?: UsageInfo }
  | { type: 'error'; requestId: string; message: string; detail?: string }
  | { type: 'aborted'; requestId: string }

export interface TestResult {
  ok: boolean
  message: string
  latencyMs?: number
  /** Model replied (first bytes of the answer) — proves end-to-end works. */
  sample?: string
}

export interface FetchModelsResult {
  ok: boolean
  models: ModelInfo[]
  message?: string
}

export interface PlatformInfo {
  platform: NodeJS.Platform
  arch: string
  appVersion: string
  electronVersion: string
  osVersion: string
}

export interface AccessibilityStatus {
  trusted: boolean
  canPrompt: boolean
}

/* ============================== History ============================== */

export interface HistoryEntry {
  id: string
  ts: number
  source: string
  question: string
  answer: string
  model: string
}
