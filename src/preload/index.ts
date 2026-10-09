import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type { PopupApi, SettingsApi } from '@shared/api'
import type {
  ActivatePayload,
  FetchModelsResult,
  HistoryEntry,
  PlatformInfo,
  PublicConfig,
  QueryEvent,
  TestResult
} from '@shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.off(channel, handler)
  }
}

/* ------------------------- shared building blocks ------------------------- */

const configRead = {
  get: (): Promise<PublicConfig> => ipcRenderer.invoke(IPC.ConfigGet),
  onChanged: (cb: (config: PublicConfig) => void): (() => void) =>
    subscribe<PublicConfig>(IPC.ConfigChanged, cb)
}

const appCommon = {
  openSettings: (): void => ipcRenderer.send(IPC.AppOpenSettings),
  openExternal: (url: string): void => ipcRenderer.send(IPC.AppOpenExternal, url),
  platformInfo: (): Promise<PlatformInfo> => ipcRenderer.invoke(IPC.AppPlatformInfo),
  accessibilityStatus: () => ipcRenderer.invoke(IPC.AppAccessibilityStatus),
  promptAccessibility: (): void => ipcRenderer.send(IPC.AppPromptAccessibility),
  openAccessibilitySettings: (): void => ipcRenderer.send(IPC.AppOpenAccessibilitySettings)
}

/* ------------------------- page-specific surfaces ------------------------- */

const popupApi: PopupApi = {
  config: configRead,
  popup: {
    onActivate: (cb) => subscribe<ActivatePayload>(IPC.Activate, cb),
    onQueryEvent: (cb) => subscribe<QueryEvent>(IPC.QueryEvent, cb),
    send: (text: string) => ipcRenderer.send(IPC.QuerySend, text),
    followUp: (text: string) => ipcRenderer.send(IPC.QueryFollowUp, text),
    regenerate: () => ipcRenderer.send(IPC.QueryRegenerate),
    stop: () => ipcRenderer.send(IPC.QueryStop),
    copy: (text: string) => ipcRenderer.send(IPC.PopupCopy, text),
    close: () => ipcRenderer.send(IPC.PopupClose),
    resize: (height: number) => ipcRenderer.send(IPC.PopupResize, height)
  },
  app: appCommon
}

const settingsApi: SettingsApi = {
  config: {
    ...configRead,
    patch: (patch: Record<string, unknown>): Promise<PublicConfig> =>
      ipcRenderer.invoke(IPC.ConfigPatch, patch),
    testProvider: (providerId: string, model?: string): Promise<TestResult> =>
      ipcRenderer.invoke(IPC.ConfigTestProvider, providerId, model),
    fetchModels: (providerId: string): Promise<FetchModelsResult> =>
      ipcRenderer.invoke(IPC.ConfigFetchModels, providerId)
  },
  app: {
    ...appCommon,
    shortcutStatus: () => ipcRenderer.invoke(IPC.AppShortcutStatus)
  },
  history: {
    list: (limit?: number): Promise<HistoryEntry[]> => ipcRenderer.invoke(IPC.HistoryList, limit),
    clear: (): Promise<void> => ipcRenderer.invoke(IPC.HistoryClear)
  }
}

/* ------------------------- page detection ------------------------- */

// The preload runs inside the renderer process, so `location` exists at
// runtime; the node-side tsconfig has no DOM lib, hence this declaration.
declare const location: { pathname: string }

// file:///…/popup.html in production, http://127.0.0.1:5173/popup.html in dev.
const isPopupPage = /(^|\/)popup\.html$/.test(location.pathname)

contextBridge.exposeInMainWorld('api', isPopupPage ? popupApi : settingsApi)
