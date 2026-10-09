import { app, clipboard, ipcMain, nativeTheme, screen, shell } from 'electron'
import os from 'node:os'
import { IPC } from '@shared/ipc'
import { resolveLocale, t, type UiLocale } from '@shared/i18n'
import type { ActivatePayload, PlatformInfo, QueryEvent } from '@shared/types'
import { ConfigStore, type ConfigPatch } from './store'
import { HistoryStore } from './services/history'
import { QuerySession } from './services/session'
import { captureText, type CaptureResult } from './services/selection'
import {
  getAccessibilityStatus,
  openAccessibilitySettings,
  promptAccessibility
} from './services/permissions'
import { getRegisteredShortcut, registerEscapeGuard, registerShortcut, unregisterAll, unregisterEscapeGuard } from './services/shortcuts'
import { PopupWindow } from './windows/popup'
import { SettingsWindow } from './windows/settings'
import { createTray, destroyTray, refreshTrayMenu, type TrayLabels } from './tray'
import { preloadPath, rendererEntry, isTrustedRendererUrl } from './utils/paths'
import { sleep } from './utils/fs'
import { testProvider, fetchModels } from './ai/client'

/** Config keys the renderer may patch — anything else is dropped. */
const ALLOWED_PATCH_KEYS = new Set([
  'version',
  'locale',
  'theme',
  'launchAtLogin',
  'shortcut',
  'selectionMode',
  'clipboardFallback',
  'hideOnBlur',
  'windowWidth',
  'maxWindowHeight',
  'providers',
  'activeProviderId',
  'activeModelId',
  'reasoningLevel',
  'temperature',
  'maxTokens',
  'showReasoning',
  'requestTimeoutSec',
  'prompts',
  'activePromptId',
  'historyEnabled',
  'historyLimit',
  'allowPlaintextSecrets',
  'secrets'
])

function sanitizePatch(patch: ConfigPatch | undefined): ConfigPatch {
  if (!patch || typeof patch !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (ALLOWED_PATCH_KEYS.has(key)) out[key] = value
  }
  return out as ConfigPatch
}

export class AskThisApp {
  private store: ConfigStore
  private history: HistoryStore
  private popup: PopupWindow
  private settingsWindow: SettingsWindow
  private session: QuerySession | null = null
  private quitting = false
  private lastShortcutOk = true
  private escapeGuardActive = false
  private escMonitorTimer: NodeJS.Timeout | null = null
  private popupShownAt = 0
  /** Re-entrancy guard: the hotkey can fire again while capture is in flight. */
  private opening = false

  constructor() {
    const dir = app.getPath('userData')
    this.store = new ConfigStore(dir)
    this.history = new HistoryStore(dir)
    this.popup = new PopupWindow(
      () => this.store.get(),
      () => this.closePopup()
    )
    this.settingsWindow = new SettingsWindow()
  }

  start(): void {
    this.setupIpc()
    this.applyTheme()
    this.applyLaunchAtLogin(this.store.get().launchAtLogin)
    this.registerHotkey()
    this.setupTray()

    this.store.onChange(() => {
      this.applyTheme()
    })

    // Load persisted API keys once the app is fully up (tray + shortcut live),
    // so a keychain authorization prompt can never block startup.
    setTimeout(() => {
      try {
        this.store.initSecrets()
      } catch (err) {
        console.warn('[app] initSecrets failed:', err)
      }
    }, 1200)

    // Fresh install: open Settings so new users immediately see the app and
    // where to configure their API key (the popup itself is a tray-only app).
    if (this.store.isFirstRun) {
      setTimeout(() => this.openSettings(), 900)
    }

    // Pre-warm the popup so the first hotkey press feels instant.
    setTimeout(() => {
      if (!this.quitting) {
        try {
          this.popup.ensureCreated(rendererEntry('popup'), preloadPath())
        } catch (err) {
          console.warn('[app] pre-warm failed:', err)
        }
      }
    }, 1500)
  }

  shutdown(): void {
    this.quitting = true
    this.session?.dispose()
    this.session = null
    destroyTray()
    unregisterAll()
  }

  /* ============================== core flows ============================== */

  async openQuickLook(): Promise<void> {
    if (this.opening) return
    this.opening = true
    try {
      await this.openQuickLookInner()
    } finally {
      this.opening = false
    }
  }

  private async openQuickLookInner(): Promise<void> {
    const cfg = this.store.get()

    // If the popup currently owns keyboard focus (user was typing in it),
    // hand focus back to the previous app before simulating a copy.
    if (this.popup.isVisible()) {
      const win = this.popup.browserWindow
      if (win?.isFocused()) {
        this.popup.hide()
        await sleep(90)
      }
    }

    const needsPermission = process.platform === 'darwin' && !getAccessibilityStatus().trusted
    let capture: CaptureResult = { text: '', source: 'none' }
    if (!needsPermission) {
      try {
        capture = await captureText(cfg.selectionMode, cfg.clipboardFallback)
      } catch (err) {
        console.warn('[app] capture failed:', err)
      }
    }

    this.session?.dispose()
    const session = new QuerySession(
      {
        store: this.store,
        history: this.history,
        emit: (event: QueryEvent) => this.popup.send(IPC.QueryEvent, event)
      },
      capture
    )
    this.session = session

    const win = this.popup.ensureCreated(rendererEntry('popup'), preloadPath())
    const wasVisible = this.popup.isVisible()
    this.popup.show(wasVisible)
    this.startEscMonitor()

    // No captured text: the user is about to type — give the window focus.
    if (!capture.text && !needsPermission) {
      win.show()
      win.focus()
    }

    const payload: ActivatePayload = {
      text: session.sourceText,
      source: capture.source,
      autoQuery: !!capture.text,
      needsPermission,
      truncated: session.truncated
    }

    await this.waitForLoad(win)
    this.popup.send(IPC.Activate, payload)
    void session.start()
  }

  private waitForLoad(win: Electron.BrowserWindow): Promise<void> {
    if (!win.webContents.isLoading()) return Promise.resolve()
    return new Promise((resolve) => {
      let settled = false
      const finish = (): void => {
        if (settled) return
        settled = true
        win.webContents.removeListener('did-finish-load', finish)
        win.webContents.removeListener('did-fail-load', finish)
        resolve()
      }
      win.webContents.once('did-finish-load', finish)
      win.webContents.once('did-fail-load', finish)
      // safety net: never hang forever on a broken load
      setTimeout(finish, 5000)
    })
  }

  private closePopup(): void {
    this.session?.dispose()
    this.session = null
    this.popup.hide()
    this.stopEscMonitor()
  }

  /**
   * Esc handling that never breaks other apps:
   * a global Esc shortcut is registered ONLY while the user's attention is
   * plausibly on the popup — the mouse is near it, it is focused, or it was
   * just shown. Otherwise Esc passes through to the frontmost app untouched.
   */
  private startEscMonitor(): void {
    this.popupShownAt = Date.now()
    this.evaluateEscGuard()
    if (!this.escMonitorTimer) {
      this.escMonitorTimer = setInterval(() => this.evaluateEscGuard(), 180)
    }
  }

  private stopEscMonitor(): void {
    if (this.escMonitorTimer) {
      clearInterval(this.escMonitorTimer)
      this.escMonitorTimer = null
    }
    this.disableEscapeGuard()
  }

  private evaluateEscGuard(): void {
    const win = this.popup.browserWindow
    if (!win || win.isDestroyed() || !this.popup.isVisible()) {
      this.disableEscapeGuard()
      return
    }
    const cursor = screen.getCursorScreenPoint()
    const b = win.getBounds()
    const margin = 28
    const near =
      cursor.x >= b.x - margin &&
      cursor.x <= b.x + b.width + margin &&
      cursor.y >= b.y - margin &&
      cursor.y <= b.y + b.height + margin
    const focused = win.isFocused()
    const justShown = Date.now() - this.popupShownAt < 2500
    const should = near || focused || justShown
    const why = `near=${near} focused=${focused} justShown=${justShown} cursor=(${cursor.x},${cursor.y}) bounds=(${b.x},${b.y},${b.width}x${b.height})`
    if (should && !this.escapeGuardActive) this.enableEscapeGuard(why)
    else if (!should && this.escapeGuardActive) this.disableEscapeGuard(why)
  }

  private enableEscapeGuard(reason = ''): void {
    if (this.escapeGuardActive) return
    this.escapeGuardActive = registerEscapeGuard(() => this.closePopup())
    console.log(`[esc] guard on: ${this.escapeGuardActive} — ${reason}`)
  }

  private disableEscapeGuard(reason = ''): void {
    if (!this.escapeGuardActive) return
    unregisterEscapeGuard()
    this.escapeGuardActive = false
    console.log(`[esc] guard off — ${reason}`)
  }

  openSettings(): void {
    this.settingsWindow.open({
      ...rendererEntry('settings'),
      preload: preloadPath()
    })
  }

  /* ============================== setup helpers ============================== */

  /**
   * IPC trust boundary: only frames that are exactly our own renderer pages
   * may call privileged handlers. Defence in depth — a foreign or compromised
   * page must never reach a privileged channel.
   */
  private guardSender(
    event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent,
    page?: 'popup' | 'settings'
  ): boolean {
    const url = event.senderFrame?.url ?? ''
    if (isTrustedRendererUrl(url, page)) return true
    console.warn('[ipc] blocked message from untrusted frame:', url.slice(0, 120))
    return false
  }

  private setupIpc(): void {
    /* config */
    ipcMain.handle(IPC.ConfigGet, (e) => {
      if (!this.guardSender(e)) return this.store.getPublic()
      return this.store.getPublic()
    })

    ipcMain.handle(IPC.ConfigPatch, (e, patch: ConfigPatch) => {
      if (!this.guardSender(e, 'settings')) return this.store.getPublic()
      const safe = sanitizePatch(patch)
      // secrets may only reference providers that actually exist
      if (safe.secrets) {
        const ids = new Set(this.store.get().providers.map((p) => p.id))
        for (const key of Object.keys(safe.secrets)) {
          if (!ids.has(key)) delete safe.secrets[key]
        }
      }
      const before = this.store.get()
      this.store.patch(safe)
      const after = this.store.get()
      if (before.shortcut !== after.shortcut) this.registerHotkey()
      if (before.launchAtLogin !== after.launchAtLogin) this.applyLaunchAtLogin(after.launchAtLogin)
      if (before.locale !== after.locale || before.launchAtLogin !== after.launchAtLogin) {
        this.refreshTray()
      }
      return this.store.getPublic()
    })

    ipcMain.handle(IPC.ConfigTestProvider, async (e, providerId: string, model?: string) => {
      if (!this.guardSender(e, 'settings')) return { ok: false, message: 'blocked' }
      const provider = this.store.get().providers.find((p) => p.id === providerId)
      if (!provider) return { ok: false, message: 'Provider not found' }
      const m = (model && model.trim()) || provider.models[0]?.id || ''
      if (!m) return { ok: false, message: 'No model selected' }
      return testProvider(provider, this.store.getApiKey(providerId), m)
    })

    ipcMain.handle(IPC.ConfigFetchModels, async (e, providerId: string) => {
      if (!this.guardSender(e, 'settings')) return { ok: false, models: [], message: 'blocked' }
      const provider = this.store.get().providers.find((p) => p.id === providerId)
      if (!provider) return { ok: false, models: [], message: 'Provider not found' }
      return fetchModels(provider, this.store.getApiKey(providerId))
    })

    /* history */
    ipcMain.handle(IPC.HistoryList, (e, limit?: number) => {
      if (!this.guardSender(e, 'settings')) return []
      return this.history.list(limit)
    })
    ipcMain.handle(IPC.HistoryClear, (e) => {
      if (!this.guardSender(e, 'settings')) return
      this.history.clear()
    })

    /* popup flow */
    ipcMain.on(IPC.QuerySend, (e, text: unknown) => {
      if (!this.guardSender(e, 'popup')) return
      if (typeof text === 'string') void this.session?.submit(text)
    })
    ipcMain.on(IPC.QueryFollowUp, (e, text: unknown) => {
      if (!this.guardSender(e, 'popup')) return
      if (typeof text === 'string') void this.session?.submit(text)
    })
    ipcMain.on(IPC.QueryRegenerate, (e) => {
      if (!this.guardSender(e, 'popup')) return
      void this.session?.regenerate()
    })
    ipcMain.on(IPC.QueryStop, (e) => {
      if (!this.guardSender(e, 'popup')) return
      this.session?.stop()
    })
    ipcMain.on(IPC.PopupCopy, (e, text: unknown) => {
      if (!this.guardSender(e, 'popup')) return
      if (typeof text === 'string') void clipboard.writeText(text).catch(() => {})
    })
    ipcMain.on(IPC.PopupClose, (e) => {
      if (!this.guardSender(e, 'popup')) return
      this.closePopup()
    })
    ipcMain.on(IPC.PopupResize, (e, height: unknown) => {
      if (!this.guardSender(e, 'popup')) return
      if (typeof height === 'number' && Number.isFinite(height)) this.popup.setHeight(height)
    })

    /* app */
    ipcMain.on(IPC.AppOpenSettings, (e) => {
      if (!this.guardSender(e)) return
      this.openSettings()
    })
    ipcMain.on(IPC.AppOpenExternal, (e, url: unknown) => {
      if (!this.guardSender(e)) return
      if (typeof url === 'string' && /^https?:\/\//i.test(url)) void shell.openExternal(url)
    })
    ipcMain.on(IPC.AppRelaunch, (e) => {
      if (!this.guardSender(e)) return
      app.relaunch()
      app.exit(0)
    })
    ipcMain.handle(IPC.AppPlatformInfo, (e): PlatformInfo => {
      if (!this.guardSender(e)) {
        return {
          platform: process.platform,
          arch: process.arch,
          appVersion: app.getVersion(),
          electronVersion: process.versions.electron,
          osVersion: ''
        }
      }
      return {
        platform: process.platform,
        arch: process.arch,
        appVersion: app.getVersion(),
        electronVersion: process.versions.electron,
        osVersion: `${os.type()} ${os.release()}`
      }
    })
    ipcMain.handle(IPC.AppAccessibilityStatus, (e) => {
      if (!this.guardSender(e)) return { trusted: false, canPrompt: false }
      return getAccessibilityStatus()
    })
    ipcMain.on(IPC.AppPromptAccessibility, (e) => {
      if (!this.guardSender(e)) return
      promptAccessibility()
    })
    ipcMain.on(IPC.AppOpenAccessibilitySettings, (e) => {
      if (!this.guardSender(e)) return
      openAccessibilitySettings()
    })
    ipcMain.handle(IPC.AppShortcutStatus, (e) => {
      if (!this.guardSender(e, 'settings')) return { accelerator: '', ok: false }
      return {
        accelerator: this.store.get().shortcut,
        ok: this.lastShortcutOk && getRegisteredShortcut() === this.store.get().shortcut
      }
    })
  }

  private registerHotkey(): void {
    const accel = this.store.get().shortcut
    this.lastShortcutOk = registerShortcut(accel, () => {
      void this.openQuickLook()
    })
    if (!this.lastShortcutOk) {
      console.warn(`[app] failed to register shortcut "${accel}"`)
    }
  }

  private applyTheme(): void {
    const theme = this.store.get().theme
    nativeTheme.themeSource = theme === 'system' ? 'system' : theme
  }

  private applyLaunchAtLogin(enabled: boolean): void {
    try {
      if (process.platform === 'darwin' || process.platform === 'win32') {
        app.setLoginItemSettings({ openAtLogin: enabled })
      }
    } catch (err) {
      console.warn('[app] failed to set login item:', err)
    }
  }

  private locale(): UiLocale {
    return resolveLocale(this.store.get().locale, app.getLocale())
  }

  private trayOptions(): Parameters<typeof createTray>[0] {
    const loc = this.locale()
    const labels: TrayLabels = {
      open: t(loc, 'tray.open'),
      settings: t(loc, 'tray.settings'),
      launchAtLogin: t(loc, 'tray.launchAtLogin'),
      quit: t(loc, 'tray.quit'),
      tip: t(loc, 'tray.tip')
    }
    return {
      labels,
      onOpen: () => void this.openQuickLook(),
      onSettings: () => this.openSettings(),
      onToggleLaunchAtLogin: () => {
        const next = !this.store.get().launchAtLogin
        this.store.patch({ launchAtLogin: next })
        this.applyLaunchAtLogin(next)
        this.refreshTray()
      },
      onQuit: () => {
        this.quitting = true
        app.quit()
      },
      getLaunchAtLogin: () => this.store.get().launchAtLogin
    }
  }

  private setupTray(): void {
    createTray(this.trayOptions())
  }

  private refreshTray(): void {
    refreshTrayMenu(this.trayOptions())
  }
}
