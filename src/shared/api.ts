import type {
  AccessibilityStatus,
  ActivatePayload,
  FetchModelsResult,
  HistoryEntry,
  PlatformInfo,
  PublicConfig,
  QueryEvent,
  TestResult
} from './types'

export interface ShortcutStatus {
  accelerator: string
  ok: boolean
}

/** The API surface exposed to the popup window (quick-look card). */
export interface PopupApi {
  config: {
    get(): Promise<PublicConfig>
    onChanged(cb: (config: PublicConfig) => void): () => void
  }
  popup: {
    onActivate(cb: (payload: ActivatePayload) => void): () => void
    onQueryEvent(cb: (event: QueryEvent) => void): () => void
    send(text: string): void
    followUp(text: string): void
    regenerate(): void
    stop(): void
    copy(text: string): void
    close(): void
    resize(height: number): void
  }
  app: {
    openSettings(): void
    openExternal(url: string): void
    platformInfo(): Promise<PlatformInfo>
    accessibilityStatus(): Promise<AccessibilityStatus>
    promptAccessibility(): void
    openAccessibilitySettings(): void
  }
}

/** The API surface exposed to the settings window — the only page allowed
 *  to mutate configuration (privileged handlers also re-check the sender). */
export interface SettingsApi {
  config: {
    get(): Promise<PublicConfig>
    patch(patch: Record<string, unknown>): Promise<PublicConfig>
    onChanged(cb: (config: PublicConfig) => void): () => void
    testProvider(providerId: string, model?: string): Promise<TestResult>
    fetchModels(providerId: string): Promise<FetchModelsResult>
  }
  app: {
    openSettings(): void
    openExternal(url: string): void
    platformInfo(): Promise<PlatformInfo>
    accessibilityStatus(): Promise<AccessibilityStatus>
    promptAccessibility(): void
    openAccessibilitySettings(): void
    shortcutStatus(): Promise<ShortcutStatus>
  }
  history: {
    list(limit?: number): Promise<HistoryEntry[]>
    clear(): Promise<void>
  }
}

/**
 * Union of both page surfaces. The preload script exposes only the subset
 * matching the page it runs in (`window.api` on the popup has no `config.patch`).
 */
export type RendererApi = PopupApi & SettingsApi
