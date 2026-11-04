const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { loadSource } = require('./load-source.cjs')

function harness(platform = 'darwin') {
  const calls = []
  let options
  class Window extends EventEmitter {
    constructor(opts) {
      super()
      options = opts
      this.webContents = new EventEmitter()
      this.webContents.setWindowOpenHandler = () => {}
    }
    setAlwaysOnTop(...args) { calls.push(['level', ...args]) }
    setVisibleOnAllWorkspaces(...args) { calls.push(['spaces', ...args]) }
    loadFile() {}
    isDestroyed() { return false }
    getBounds() { return { x: 0, y: 0, width: 480, height: 132 } }
    setBounds() { this.emit('moved') }
    showInactive() { calls.push(['inactive']) }
    show() { calls.push(['show']) }
    moveTop() { calls.push(['top']) }
    hide() {}
  }
  const { PopupWindow } = loadSource('src/main/windows/popup.ts', {
    electron: { BrowserWindow: Window, shell: {}, screen: {
      getCursorScreenPoint: () => ({ x: 100, y: 100 }),
      getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } })
    } }
  }, { process: { platform, env: {} } })
  const popup = new PopupWindow(() => ({ windowWidth: 480 }))
  popup.ensureCreated({ file: 'popup.html' }, 'preload.js')
  return { popup, calls, options }
}

test('macOS panel stays below native IME candidates on creation and every reveal', () => {
  const h = harness()
  h.popup.show(false)
  h.popup.hide()
  h.popup.show(false)
  const levels = h.calls.filter(([name]) => name === 'level')
  assert.equal(levels.length, 3, 'set a safe level at creation and each reveal')
  for (const call of levels) assert.deepEqual(call, ['level', true, 'floating'])
  assert.equal(h.options.type, 'panel', 'keep NSPanel so fullscreen Space membership is preserved')
  for (const call of h.calls.filter(([name]) => name === 'spaces')) {
    assert.equal(call[1], true)
    assert.equal(call[2].visibleOnFullScreen, true)
  }
  assert.equal(h.calls.filter(([name]) => name === 'inactive').length, 2, 'selection lookup must not steal focus')
  assert.equal(h.calls.filter(([name]) => name === 'top').length, 2)
  assert.equal(h.calls.filter(([name]) => name === 'show').length, 0)
})

test('other platforms retain their existing always-on-top and show behavior', () => {
  const h = harness('win32')
  h.popup.show(false)
  assert.equal(h.options.alwaysOnTop, true)
  assert.equal(h.options.type, undefined)
  assert.equal(h.calls.filter(([name]) => name === 'level' || name === 'spaces').length, 0)
  assert.equal(h.calls.filter(([name]) => name === 'show').length, 1)
})
