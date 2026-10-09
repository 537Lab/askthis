import { globalShortcut } from 'electron'

let current: string | null = null

/** Register the single global hotkey. Returns false when the combo is taken. */
export function registerShortcut(accelerator: string, handler: () => void): boolean {
  if (current) {
    try {
      globalShortcut.unregister(current)
    } catch {
      /* ignore */
    }
  }
  current = null
  try {
    const ok = globalShortcut.register(accelerator, handler)
    if (ok) current = accelerator
    return ok
  } catch {
    return false
  }
}

/**
 * While the popup is visible, Esc must close it even when the popup does not
 * own keyboard focus (the common case — we show it without stealing focus).
 */
export function registerEscapeGuard(handler: () => void): boolean {
  try {
    return globalShortcut.register('Escape', handler)
  } catch {
    return false
  }
}

export function unregisterEscapeGuard(): void {
  try {
    globalShortcut.unregister('Escape')
  } catch {
    /* ignore */
  }
}

export function unregisterAll(): void {
  try {
    globalShortcut.unregisterAll()
  } catch {
    /* ignore */
  }
  current = null
}

export function getRegisteredShortcut(): string | null {
  return current
}
