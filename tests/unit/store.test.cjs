const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { loadSource } = require('./load-source.cjs')
const { ConfigStore } = loadSource('src/main/store.ts', { electron: { safeStorage: {} } })

function tempStore(t, config) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || path.join(process.env.HOME, '.hermes/cache/scratch'), 'askthis-unit-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  if (config) fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config))
  return { dir, store: new ConfigStore(dir) }
}

test('legacy auto config migrates the old fallback default once without losing user settings', (t) => {
  const { dir, store } = tempStore(t, { version: 1, selectionMode: 'auto', clipboardFallback: true, shortcut: 'Alt+Shift+F', locale: 'en-US', windowWidth: 640, historyEnabled: false })
  assert.equal(store.get().clipboardFallback, false)
  assert.equal(store.get().shortcut, 'Alt+Shift+F')
  assert.equal(store.get().locale, 'en-US')
  assert.equal(store.get().windowWidth, 640)
  assert.equal(store.get().historyEnabled, false)
  assert.ok(store.get().version > 1)
  store.patch({ clipboardFallback: true })
  assert.equal(new ConfigStore(dir).get().clipboardFallback, true, 'post-migration opt-in must survive reload')
})

for (const mode of ['clipboard', 'manual']) {
  test(`migration preserves explicit ${mode} mode`, (t) => {
    const { dir, store } = tempStore(t, { version: 1, selectionMode: mode, clipboardFallback: true })
    assert.equal(store.get().selectionMode, mode)
    assert.equal(store.get().clipboardFallback, true)
    assert.equal(new ConfigStore(dir).get().selectionMode, mode)
  })
}

test('malformed fallback values sanitize to the safe default', (t) => {
  const { store } = tempStore(t, { version: 2, clipboardFallback: 'true' })
  assert.equal(store.get().clipboardFallback, false)
})

test('fresh installs default to selection-or-input, not stale clipboard fallback', (t) => {
  const { store } = tempStore(t)
  assert.equal(store.get().selectionMode, 'auto')
  assert.equal(store.get().clipboardFallback, false)
})
