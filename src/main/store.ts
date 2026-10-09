import { safeStorage } from 'electron'
import { join } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import type {
  AppConfig,
  PromptPreset,
  ProviderConfig,
  PublicConfig,
  ReasoningLevel,
  SelectionMode,
  ThemePref,
  LocalePref
} from '@shared/types'
import { CONFIG_VERSION, BUILTIN_PROMPTS, createDefaultConfig } from '@shared/defaults'
import { PROVIDER_PRESETS, providerFromPreset } from '@shared/presets'
import { ensureDir, readJsonSafe, writeFileAtomic } from './utils/fs'

const REASONING_LEVELS: ReasoningLevel[] = ['off', 'low', 'medium', 'high', 'max']
const SELECTION_MODES: SelectionMode[] = ['auto', 'clipboard', 'manual']
const THEMES: ThemePref[] = ['system', 'light', 'dark']
const LOCALES: LocalePref[] = ['system', 'zh-CN', 'en-US']
const VALID_REASONING_STYLES: Array<ProviderConfig['reasoningStyle']> = [
  'auto',
  'effort',
  'deepseek',
  'anthropic',
  'openrouter',
  'none'
]

/** Migrate legacy style names from early builds. */
const LEGACY_STYLE_MAP: Record<string, ProviderConfig['reasoningStyle']> = {
  'openai-effort': 'effort',
  'deepseek-thinking': 'deepseek',
  'anthropic-thinking': 'anthropic'
}

interface SecretsFile {
  encrypted: boolean
  data: string
}

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback
  return Math.min(max, Math.max(min, Math.round(v)))
}

function maskKey(key: string | undefined): string {
  if (!key) return ''
  if (key.length <= 8) return '••••'
  return `${key.slice(0, 4)}…${key.slice(-4)}`
}

export interface ConfigPatch extends Partial<AppConfig> {
  /** Set a provider key (string), or remove it (null). Values never touch disk unencrypted. */
  secrets?: Record<string, string | null>
}

/**
 * Persistent configuration store.
 * - config.json  : everything except secrets (human-readable, safe to share)
 * - secrets.dat  : API keys, encrypted via the OS keychain when available
 */
export class ConfigStore {
  private configPath: string
  private secretsPath: string
  private config!: AppConfig
  private keys = new Map<string, string>()
  private listeners = new Set<() => void>()

  constructor(private dir: string) {
    this.configPath = join(dir, 'config.json')
    this.secretsPath = join(dir, 'secrets.dat')
    this.load()
  }

  /* ------------------------------ loading ------------------------------ */

  private load(): void {
    ensureDir(this.dir)
    const raw = readJsonSafe<Partial<AppConfig>>(this.configPath)
    this.config = raw ? this.sanitize({ ...createDefaultConfig(), ...raw }) : this.seed()
    this.persistConfig() // normalise + migrate on disk
    // NOTE: secrets are NOT loaded here — see initSecrets(). Deferring the
    // keychain access keeps a possible authorization prompt (which can appear
    // after app updates) from blocking application startup.
  }

  /**
   * Load persisted API keys. Call once the app is fully initialised (tray and
   * shortcut live). Does not touch the keychain at all when no key was ever
   * saved, so a fresh install never triggers a keychain prompt.
   */
  initSecrets(): void {
    if (this.secretsInitialized) return
    this.secretsInitialized = true
    if (!existsSync(this.secretsPath)) return
    try {
      this.encryptionAvailable = safeStorage.isEncryptionAvailable()
    } catch {
      this.encryptionAvailable = false
    }
    this.loadSecrets()
  }

  private secretsInitialized = false
  private encryptionAvailable: boolean | null = null

  /** First run: seed with built-in prompts and two ready-to-configure providers. */
  private seed(): AppConfig {
    const cfg = createDefaultConfig()
    cfg.prompts = [...BUILTIN_PROMPTS]
    const deepseek = PROVIDER_PRESETS.find((p) => p.id === 'deepseek')
    const openai = PROVIDER_PRESETS.find((p) => p.id === 'openai')
    cfg.providers = [deepseek, openai].filter(Boolean).map((p) => providerFromPreset(p!))
    cfg.activeProviderId = cfg.providers[0]?.id ?? ''
    cfg.activeModelId = cfg.providers[0]?.models[0]?.id ?? ''
    return cfg
  }

  private loadSecrets(): void {
    try {
      if (!existsSync(this.secretsPath)) return
      const raw = JSON.parse(readFileSync(this.secretsPath, 'utf8')) as SecretsFile
      let json: string
      if (raw.encrypted) {
        if (this.encryptionAvailable !== true) {
          console.warn('[store] secrets are encrypted but OS encryption is unavailable; keys not loaded')
          return
        }
        json = safeStorage.decryptString(Buffer.from(raw.data, 'base64'))
      } else {
        json = raw.data
      }
      const obj = JSON.parse(json) as Record<string, string>
      this.keys = new Map(Object.entries(obj).filter(([, v]) => typeof v === 'string' && v.length > 0))
    } catch (err) {
      console.warn('[store] failed to load secrets:', err)
    }
  }

  /** Returns false when keys could not be persisted securely. */
  private saveSecrets(): boolean {
    const json = JSON.stringify(Object.fromEntries(this.keys))
    let enc = false
    try {
      enc = safeStorage.isEncryptionAvailable()
    } catch {
      enc = false
    }
    this.encryptionAvailable = enc
    if (enc) {
      const file: SecretsFile = {
        encrypted: true,
        data: safeStorage.encryptString(json).toString('base64')
      }
      writeFileAtomic(this.secretsPath, JSON.stringify(file), 0o600)
      return true
    }
    if (this.config.allowPlaintextSecrets) {
      // Explicit user opt-in only — never downgrade silently.
      const file: SecretsFile = { encrypted: false, data: json }
      writeFileAtomic(this.secretsPath, JSON.stringify(file), 0o600)
      return true
    }
    console.warn(
      '[store] OS keychain unavailable and plaintext storage not allowed — keys kept in memory only'
    )
    return false
  }

  /* ------------------------------ access ------------------------------ */

  get(): AppConfig {
    return this.config
  }

  getPublic(): PublicConfig {
    return {
      ...this.config,
      providers: this.config.providers.map((p) => ({
        ...p,
        hasKey: this.keys.has(p.id) && this.keys.get(p.id) !== '',
        keyHint: maskKey(this.keys.get(p.id))
      })),
      security: {
        // null = not probed yet (no keys ever saved) — assume available.
        encryptionAvailable: this.encryptionAvailable ?? true,
        plaintextAllowed: this.config.allowPlaintextSecrets
      }
    }
  }

  getApiKey(providerId: string): string | undefined {
    this.initSecrets() // idempotent; covers the "query before the deferred load" case
    return this.keys.get(providerId)
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  /* ------------------------------ mutation ------------------------------ */

  patch(patch: ConfigPatch): void {
    const { secrets, ...rest } = patch
    if (secrets) {
      for (const [providerId, value] of Object.entries(secrets)) {
        if (value === null) this.keys.delete(providerId)
        else if (typeof value === 'string' && value.length > 0) this.keys.set(providerId, value)
      }
      if (!this.saveSecrets()) {
        console.warn('[store] key(s) kept in memory only — secure storage unavailable')
      }
    }
    this.config = this.sanitize({ ...this.config, ...rest })
    this.persistConfig()
    this.listeners.forEach((cb) => {
      try {
        cb()
      } catch (err) {
        console.warn('[store] listener failed:', err)
      }
    })
  }

  /* ------------------------------ helpers ------------------------------ */

  private sanitize(cfg: AppConfig): AppConfig {
    cfg.version = CONFIG_VERSION
    if (!LOCALES.includes(cfg.locale)) cfg.locale = 'system'
    if (!THEMES.includes(cfg.theme)) cfg.theme = 'system'
    if (!SELECTION_MODES.includes(cfg.selectionMode)) cfg.selectionMode = 'auto'
    if (!REASONING_LEVELS.includes(cfg.reasoningLevel)) cfg.reasoningLevel = 'low'
    cfg.windowWidth = clamp(cfg.windowWidth, 320, 720, 480)
    cfg.maxWindowHeight = clamp(cfg.maxWindowHeight, 200, 900, 560)
    cfg.maxTokens = clamp(cfg.maxTokens, 64, 32768, 2048)
    cfg.requestTimeoutSec = clamp(cfg.requestTimeoutSec, 5, 600, 60)
    cfg.historyLimit = clamp(cfg.historyLimit, 0, 500, 50)
    if (typeof cfg.shortcut !== 'string' || cfg.shortcut.trim() === '') cfg.shortcut = 'Alt+Shift+D'
    if (typeof cfg.clipboardFallback !== 'boolean') cfg.clipboardFallback = true
    if (typeof cfg.allowPlaintextSecrets !== 'boolean') cfg.allowPlaintextSecrets = false
    if (cfg.temperature != null && (typeof cfg.temperature !== 'number' || cfg.temperature < 0 || cfg.temperature > 2)) {
      cfg.temperature = null
    }
    if (!Array.isArray(cfg.prompts) || cfg.prompts.length === 0) {
      cfg.prompts = [...BUILTIN_PROMPTS]
    }
    cfg.prompts = cfg.prompts.filter((p): p is PromptPreset => !!p && typeof p.id === 'string')
    if (!cfg.prompts.some((p) => p.id === cfg.activePromptId)) {
      cfg.activePromptId = cfg.prompts[0]?.id ?? 'lookup-zh'
    }
    if (!Array.isArray(cfg.providers)) cfg.providers = []
    cfg.providers = cfg.providers
      .filter((p): p is ProviderConfig => !!p && typeof p.id === 'string' && typeof p.baseUrl === 'string')
      .map((p) => ({
        id: String(p.id),
        name: String(p.name ?? p.id),
        kind: p.kind === 'anthropic' ? ('anthropic' as const) : ('openai-compatible' as const),
        baseUrl: String(p.baseUrl ?? ''),
        customHeaders:
          p.customHeaders && typeof p.customHeaders === 'object' ? p.customHeaders : undefined,
        models: Array.isArray(p.models)
          ? p.models.filter((m) => m && typeof m.id === 'string').map((m) => ({ ...m }))
          : [],
        reasoningStyle: VALID_REASONING_STYLES.includes(p.reasoningStyle)
          ? p.reasoningStyle
          : (LEGACY_STYLE_MAP[p.reasoningStyle as string] ?? 'auto')
      }))
    const active = cfg.providers.find((p) => p.id === cfg.activeProviderId)
    if (!active) {
      cfg.activeProviderId = cfg.providers[0]?.id ?? ''
      cfg.activeModelId = cfg.providers[0]?.models[0]?.id ?? ''
    } else if (!active.models.some((m) => m.id === cfg.activeModelId) && active.models.length > 0) {
      cfg.activeModelId = active.models[0].id
    }
    return cfg
  }

  private persistConfig(): void {
    writeFileAtomic(this.configPath, JSON.stringify(this.config, null, 2), 0o600)
  }
}
