import { clipboard } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { CaptureSource, SelectionMode } from '@shared/types'
import { sleep } from '../utils/fs'

const pExecFile = promisify(execFile)

export interface CaptureResult {
  text: string
  source: CaptureSource
}

export async function captureText(mode: SelectionMode, clipboardFallback = false): Promise<CaptureResult> {
  if (mode === 'manual') return { text: '', source: 'none' }

  if (mode === 'clipboard') {
    const t = (await clipboard.readText().catch(() => '')).trim()
    return t ? { text: t, source: 'clipboard' } : { text: '', source: 'none' }
  }

  // auto: selected text first; clipboard only when the user allows the fallback
  const selected = await readSelectedText()
  if (selected) return { text: selected, source: 'selection' }
  if (!clipboardFallback) return { text: '', source: 'none' }
  const t = (await clipboard.readText().catch(() => '')).trim()
  return t ? { text: t, source: 'clipboard' } : { text: '', source: 'none' }
}

/* ============================== selection readers ============================== */

async function readSelectedText(): Promise<string | null> {
  try {
    if (process.platform === 'darwin') return await readSelectedMac()
    if (process.platform === 'win32') return await readSelectedWindows()
    return await readSelectedLinux()
  } catch (err) {
    console.warn('[selection] read failed:', err)
    return null
  }
}

/* ------------------------------ macOS ------------------------------ */

// Native AX avoids a System Events Automation prompt on the fast path.
// An unsupported attribute/error is UNKNOWN, not proof of an empty selection:
// those apps still need the copy fallback (PDF readers, terminals, etc.).
const MAC_AX_SCRIPT = `
ObjC.import('Cocoa');
ObjC.import('ApplicationServices');
ObjC.bindFunction('AXUIElementCreateApplication', ['id', ['int']]);
ObjC.bindFunction('AXUIElementCopyAttributeValue', ['int', ['id', 'id', 'id*']]);
function run() {
  try {
    const app = $.NSWorkspace.sharedWorkspace.frontmostApplication;
    const root = $.AXUIElementCreateApplication(app.processIdentifier);
    const focused = Ref();
    if ($.AXUIElementCopyAttributeValue(root, $('AXFocusedUIElement'), focused) !== 0)
      return 'ASKTHIS_UNKNOWN';
    const selected = Ref();
    if ($.AXUIElementCopyAttributeValue(focused[0], $('AXSelectedText'), selected) !== 0)
      return 'ASKTHIS_UNKNOWN';
    const text = ObjC.unwrap(selected[0]);
    if (typeof text !== 'string') return 'ASKTHIS_UNKNOWN';
    return text.length ? 'ASKTHIS_TEXT\\n' + text : 'ASKTHIS_EMPTY';
  } catch (_) {
    return 'ASKTHIS_UNKNOWN';
  }
}`

async function readSelectedMac(): Promise<string | null> {
  // Path A: read the selection via the Accessibility API (no side effects).
  try {
    const { stdout } = await pExecFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', MAC_AX_SCRIPT], {
      timeout: 1500
    })
    if (stdout.trim() === 'ASKTHIS_EMPTY') return null
    if (stdout.startsWith('ASKTHIS_TEXT\n')) return stdout.slice('ASKTHIS_TEXT\n'.length).trim() || null
  } catch {
    /* fall through to the copy-based path */
  }

  // Path B: simulate ⌘C and read the clipboard, restoring it afterwards.
  return await readViaCopy(async () => {
    await pExecFile(
      '/usr/bin/osascript',
      ['-e', 'tell application "System Events" to keystroke "c" using command down'],
      { timeout: 1500 }
    )
  })
}

/* ------------------------------ Windows ------------------------------ */

const WIN_UIA_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$el = [System.Windows.Automation.AutomationElement]::FocusedElement
if ($el -ne $null) {
  $pattern = $el.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
  if ($pattern -ne $null) {
    $ranges = $pattern.GetSelection()
    if ($ranges.Count -gt 0) {
      $text = $ranges[0].GetText(-1)
      [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
      Write-Output $text
    }
  }
}`

// Sends Ctrl+C via keybd_event (works in any focused window, no focus stealing).
const WIN_COPY_SCRIPT = `
$signature = @'
[DllImport("user32.dll")]
public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, System.UIntPtr dwExtraInfo);
'@
$kb = Add-Type -MemberDefinition $signature -Name 'AskThisKeyboard' -Namespace 'AskThis' -PassThru
$kb::keybd_event(0x11, 0, 0, [System.UIntPtr]::Zero)
$kb::keybd_event(0x43, 0, 0, [System.UIntPtr]::Zero)
Start-Sleep -Milliseconds 30
$kb::keybd_event(0x43, 0, 2, [System.UIntPtr]::Zero)
$kb::keybd_event(0x11, 0, 2, [System.UIntPtr]::Zero)`

async function readSelectedWindows(): Promise<string | null> {
  // Path A: UI Automation text pattern (no clipboard side effects).
  try {
    const { stdout } = await pExecFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WIN_UIA_SCRIPT],
      { timeout: 2500, windowsHide: true }
    )
    const text = stdout.replace(/\r\n/g, '\n').trim()
    if (text) return text
  } catch {
    /* fall through */
  }

  // Path B: simulate Ctrl+C + clipboard.
  return await readViaCopy(async () => {
    await pExecFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WIN_COPY_SCRIPT],
      { timeout: 2500, windowsHide: true }
    )
  })
}

/* ------------------------------ Linux (best effort) ------------------------------ */

async function readSelectedLinux(): Promise<string | null> {
  // X11 synthetic copy is unavailable on Wayland. Only captureText may read
  // existing clipboard contents, and only after an explicit user opt-in.
  if (process.env.XDG_SESSION_TYPE === 'wayland') return null
  try {
    return await readViaCopy(async () => {
      await pExecFile('xdotool', ['key', '--clearmodifiers', 'ctrl+c'], { timeout: 1500 })
    })
  } catch {
    return null
  }
}

/* ------------------------------ shared copy path ------------------------------ */

/**
 * Waits for the clipboard to change after a simulated copy keystroke,
 * restores the previous clipboard content and returns the copied text.
 */
async function readViaCopy(sendCopy: () => Promise<void>): Promise<string | null> {
  const before = await clipboard.readText().catch(() => '')
  const hadNonText = await hasNonTextClipboard()

  await sendCopy()

  const start = Date.now()
  while (Date.now() - start < 800) {
    await sleep(35)
    const now = await clipboard.readText().catch(() => '')
    if (now !== '' && now !== before) {
      if (!hadNonText) {
        // restore the user's previous clipboard text
        await clipboard.writeText(before).catch(() => {})
      }
      // else: the clipboard previously held non-text data (e.g. an image) which we
      // cannot faithfully restore — leave the fresh copy in place instead.
      return now.trim() || null
    }
  }
  return null
}

/** True when the clipboard holds data we cannot restore as plain text. */
async function hasNonTextClipboard(): Promise<boolean> {
  try {
    const items = await clipboard.read()
    return items.some((item) => item.types.some((t) => !t.startsWith('text/')))
  } catch {
    return false
  }
}
