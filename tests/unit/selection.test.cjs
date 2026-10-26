const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadSource } = require('./load-source.cjs')

function selectionHarness({ probe = 'ASKTHIS_EMPTY', platform = 'darwin', oldText = 'old clipboard', copiedText, copyError = false } = {}) {
  const commands = []
  const writes = []
  let text = oldText
  let reads = 0
  const execFile = (file, args, options, callback) => {
    const script = args.join(' ')
    commands.push(script)
    const copy = script.includes('keystroke "c"') || file === 'xdotool' || script.includes('keybd_event')
    if (copy && copiedText !== undefined) text = copiedText
    callback(copy && copyError ? new Error('copy unavailable') : null, copy ? '' : probe, '')
  }
  execFile[require('node:util').promisify.custom] = (file, args, options) => new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => error ? reject(error) : resolve({ stdout, stderr }))
  })
  const clipboard = {
    readText: async () => { reads++; return text },
    writeText: async (value) => { text = value; writes.push(value) },
    read: async () => [{ types: ['text/plain'] }]
  }
  const source = loadSource('src/main/services/selection.ts', {
    electron: { clipboard }, 'node:child_process': { execFile }
  }, { process: { platform, env: { XDG_SESSION_TYPE: platform === 'linux' ? 'wayland' : '' } } })
  return { ...source, commands, writes, get reads() { return reads } }
}

test('Wayland auto capture never mislabels old clipboard content as a selection', async () => {
  const h = selectionHarness({ platform: 'linux' })
  const result = await h.captureText('auto')
  assert.equal(result.text, '')
  assert.equal(result.source, 'none')
  assert.equal(h.reads, 0)
})

test('native AX selection is queried without touching clipboard', async () => {
  const h = selectionHarness({ probe: 'ASKTHIS_TEXT\n selected text \n' })
  const result = await h.captureText('auto')
  assert.equal(result.text, 'selected text')
  assert.equal(result.source, 'selection')
  assert.equal(h.commands.length, 1)
  assert.equal(h.reads, 0)
})

test('unsupported AX still copies a fresh selection and restores old clipboard', async () => {
  const h = selectionHarness({ probe: 'ASKTHIS_UNKNOWN', copiedText: 'copied selection' })
  const result = await h.captureText('auto')
  assert.equal(result.text, 'copied selection')
  assert.equal(result.source, 'selection')
  assert.equal(h.commands.length, 2)
  assert.deepEqual(h.writes, ['old clipboard'])
})

test('explicit clipboard mode keeps reading existing clipboard text', async () => {
  const h = selectionHarness()
  const result = await h.captureText('clipboard')
  assert.equal(result.text, 'old clipboard')
  assert.equal(result.source, 'clipboard')
  assert.equal(h.commands.length, 0)
})

test('explicit fallback remains available in auto mode', async () => {
  const h = selectionHarness()
  const result = await h.captureText('auto', true)
  assert.equal(result.text, 'old clipboard')
  assert.equal(result.source, 'clipboard')
})

test('manual mode does not probe selection or clipboard', async () => {
  const h = selectionHarness()
  assert.equal((await h.captureText('manual')).source, 'none')
  assert.equal(h.commands.length, 0)
  assert.equal(h.reads, 0)
})

exports.selectionHarness = selectionHarness

test('auto defaults to a blank input instead of consuming stale clipboard text', async () => {
  const h = selectionHarness()
  const result = await h.captureText('auto')
  assert.equal(result.text, '')
  assert.equal(result.source, 'none')
  assert.equal(h.reads, 0)
})

test('confirmed empty AX selection opens blank without copying or waiting', async () => {
  const h = selectionHarness()
  const result = await h.captureText('auto', false)
  assert.equal(result.text, '')
  assert.equal(result.source, 'none')
  assert.equal(h.commands.length, 1, 'must not send Cmd+C when AX confirms no selection')
  assert.equal(h.reads, 0, 'must not touch the old clipboard')
})
