const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { loadSource } = require('./load-source.cjs')

function harness(platform = 'darwin') {
  const calls = []
  let options
  let bounds = { x: 0, y: 0, width: 480, height: 132 }
  const cfg = { windowWidth: 480, maxWindowHeight: 560 }
  class Window extends EventEmitter {
    constructor(opts) {
      super()
      options = opts
      bounds = { x: 0, y: 0, width: opts.width, height: opts.height }
      this.webContents = new EventEmitter()
      this.webContents.setWindowOpenHandler = () => {}
    }
    setAlwaysOnTop(...args) { calls.push(['level', ...args]) }
    setVisibleOnAllWorkspaces(...args) { calls.push(['spaces', ...args]) }
    loadFile() {}
    isDestroyed() { return false }
    getBounds() { return { ...bounds } }
    setBounds(next, emitMoved = true) {
      bounds = { ...next }
      calls.push(['bounds', bounds])
      if (emitMoved) this.emit('moved')
    }
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
  const popup = new PopupWindow(() => cfg)
  popup.ensureCreated({ file: 'popup.html' }, 'preload.js')
  return {
    popup,
    calls,
    options,
    cfg,
    simulateUserDrag(x, y) {
      bounds = { ...bounds, x, y }
      popup.browserWindow.emit('moved')
    }
  }
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

test('user drag is detected immediately even after programmatic setHeight calls without moved events', () => {
  const h = harness()
  // 覆盖 setBounds，模拟原生在仅修改高度时不触发 moved 的场景
  const win = h.popup.browserWindow
  const origSetBounds = win.setBounds.bind(win)
  win.setBounds = (next) => origSetBounds(next, false)

  h.popup.position()
  h.popup.setHeight(240)
  h.popup.setHeight(320)
  // 真实用户将窗口拖走
  h.simulateUserDrag(400, 260)
  const beforeCount = h.calls.filter(([n]) => n === 'bounds').length
  // existingPosition=true 且 userMoved=true 时 show 不应再把窗口重置回鼠标旁
  h.popup.show(true)
  const afterCount = h.calls.filter(([n]) => n === 'bounds').length
  assert.equal(afterCount, beforeCount)
  assert.deepEqual(win.getBounds(), { x: 400, y: 260, width: 480, height: 320 })
})

test('syncConfig updates popup width and clamps height/position within workArea', () => {
  const h = harness()
  h.popup.setHeight(500)
  h.cfg.windowWidth = 600
  h.cfg.maxWindowHeight = 360
  h.popup.syncConfig()
  const b = h.popup.browserWindow.getBounds()
  assert.equal(b.width, 600)
  assert.equal(b.height, 360)
})
