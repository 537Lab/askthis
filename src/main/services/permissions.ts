import { shell, systemPreferences } from 'electron'
import type { AccessibilityStatus } from '@shared/types'

export function getAccessibilityStatus(): AccessibilityStatus {
  if (process.platform !== 'darwin') return { trusted: true, canPrompt: false }
  return {
    trusted: systemPreferences.isTrustedAccessibilityClient(false),
    canPrompt: true
  }
}

/** Asks macOS to show the native "grant accessibility" prompt (once). */
export function promptAccessibility(): void {
  if (process.platform === 'darwin') {
    systemPreferences.isTrustedAccessibilityClient(true)
  }
}

export function openAccessibilitySettings(): void {
  if (process.platform === 'darwin') {
    shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
    )
  }
}
