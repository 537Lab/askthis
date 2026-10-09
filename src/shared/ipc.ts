/**
 * IPC channel names — single source of truth for main / preload / renderer.
 */

export const IPC = {
  /* config */
  ConfigGet: 'config:get',
  ConfigPatch: 'config:patch',
  ConfigChanged: 'config:changed', // main → renderer
  ConfigTestProvider: 'config:test-provider',
  ConfigFetchModels: 'config:fetch-models',

  /* query flow (popup) */
  Activate: 'popup:activate', // main → renderer
  QueryEvent: 'query:event', // main → renderer
  QuerySend: 'query:send',
  QueryFollowUp: 'query:followup',
  QueryRegenerate: 'query:regenerate',
  QueryStop: 'query:stop',

  /* popup window plumbing */
  PopupCopy: 'popup:copy',
  PopupClose: 'popup:close',
  PopupResize: 'popup:resize',

  /* app */
  AppOpenSettings: 'app:open-settings',
  AppOpenExternal: 'app:open-external',
  AppPlatformInfo: 'app:platform-info',
  AppAccessibilityStatus: 'app:accessibility-status',
  AppPromptAccessibility: 'app:prompt-accessibility',
  AppOpenAccessibilitySettings: 'app:open-accessibility-settings',
  AppShortcutStatus: 'app:shortcut-status',

  /* history */
  HistoryList: 'history:list',
  HistoryClear: 'history:clear'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
