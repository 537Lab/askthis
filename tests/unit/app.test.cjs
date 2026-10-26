const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadSource } = require('./load-source.cjs')

function appHarness({ trusted = false, mode = 'auto', capture = { text: '', source: 'none' } } = {}) {
  const calls = [], sent = [], escapeCallbacks = []
  const cfg = { selectionMode: mode, clipboardFallback: false }
  const win = { show: () => calls.push('show'), focus: () => calls.push('focus'), webContents: { isLoading: () => false } }
  const { AskThisApp } = loadSource('src/main/app.ts', {
    electron: { screen: { getCursorScreenPoint: () => ({ x: 0, y: 0 }) } },
    './services/permissions': { getAccessibilityStatus: () => ({ trusted }) },
    './services/selection': { captureText: async () => { calls.push('capture'); return capture } },
    './services/session': { QuerySession: class {
      constructor(deps, captured) { this.sourceText = captured.text; this.truncated = false }
      start() { calls.push('start') }
    } },
    './windows/popup': {}, './windows/settings': {}, './tray': {}, './ai/client': {},
    './services/shortcuts': { registerEscapeGuard: (callback) => { escapeCallbacks.push(callback); return true } },
    './utils/paths': { rendererEntry: () => 'popup', preloadPath: () => 'preload' }
  }, { process: { platform: 'darwin' } })
  const app = Object.create(AskThisApp.prototype)
  app.store = { get: () => cfg }
  app.history = {}
  app.opening = false
  app.popup = { isVisible: () => false, ensureCreated: () => win, show: () => calls.push('popup'), send: (channel, payload) => sent.push(payload) }
  app.startEscMonitor = () => calls.push('monitor')
  return { app, calls, sent, escapeCallbacks }
}

test('focused popup leaves Escape to its IME-aware renderer instead of a global shortcut', () => {
  const h = appHarness()
  h.app.popup.isVisible = () => true
  h.app.popup.browserWindow = { isDestroyed: () => false, isFocused: () => true, getBounds: () => ({ x: 0, y: 0, width: 480, height: 300 }) }
  let globalEscape = false
  h.app.enableEscapeGuard = () => { globalEscape = true }
  h.app.disableEscapeGuard = () => { globalEscape = false }
  h.app.evaluateEscGuard()
  assert.equal(globalEscape, false)
})

test('global Escape rechecks focus when invoked before the next monitor tick', () => {
  const h = appHarness()
  let focused = false
  let closed = 0
  h.app.popup.isVisible = () => true
  h.app.popup.browserWindow = { isDestroyed: () => false, isFocused: () => focused, getBounds: () => ({ x: 0, y: 0, width: 480, height: 300 }) }
  h.app.closePopup = () => { closed++ }
  h.app.evaluateEscGuard()
  assert.equal(h.escapeCallbacks.length, 1, 'unfocused popup registers global Escape')

  focused = true // Focus changes before the 180 ms monitor can unregister Escape.
  h.escapeCallbacks[0]()
  assert.equal(closed, 0, 'focused popup must leave Escape to the IME-aware renderer')

  focused = false
  h.escapeCallbacks[0]()
  assert.equal(closed, 1, 'global Escape still closes an unfocused popup')
})

test('explicit clipboard mode captures without Accessibility permission', async () => {
  const h = appHarness({ mode: 'clipboard', capture: { text: 'explicit clipboard', source: 'clipboard' } })
  await h.app.openQuickLook()
  assert.ok(h.calls.includes('capture'))
  assert.equal(h.sent[0].needsPermission, false)
  assert.equal(h.sent[0].text, 'explicit clipboard')
  assert.equal(h.sent[0].autoQuery, true)
})

test('missing Accessibility still focuses a blank input while reporting the permission warning', async () => {
  const h = appHarness()
  await h.app.openQuickLook()
  assert.ok(h.calls.includes('focus'), 'permission must not block manual input')
  assert.ok(h.calls.indexOf('focus') < h.calls.indexOf('monitor'), 'focus before arming Esc so IME input is never intercepted')
  assert.ok(!h.calls.includes('capture'), 'do not attempt AX or synthetic copy without permission')
  assert.equal(h.sent[0].needsPermission, true)
  assert.equal(h.sent[0].autoQuery, false)
  assert.equal(h.sent[0].text, '')
})
