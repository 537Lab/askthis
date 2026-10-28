const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadSource } = require('./load-source.cjs')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const root = path.resolve(__dirname, '../..')

// The existing header, settings footer and About page all use this component.
test('brand component uses the approved B2 optical master at small sizes without changing its box', () => {
  const { LogoIcon } = loadSource('src/renderer/src/shared/icons.tsx')
  for (const size of [12, 16, 18, 32]) {
    const logo = LogoIcon({ size })
    assert.equal(logo.props.width, size)
    assert.equal(logo.props.height, size)
    assert.equal(logo.props.viewBox, '18 18 92 92')
    assert.equal(logo.props.fill, 'currentColor')
    assert.equal(logo.props.style.color, 'var(--text)')
    const group = logo.props.children
    assert.equal(group.props.transform, 'translate(0.25 -1)')
    assert.equal(group.props.children.props.fillRule, 'evenodd')
    assert.ok(group.props.children.props.d.includes('80.1 65'), 'approved optical counter, not the old frame/spark')
  }
})

test('tray loads the monochrome template on macOS and the approved app tile elsewhere', () => {
  for (const platform of ['darwin', 'win32', 'linux']) {
    const calls = []
    const image = { isEmpty: () => false, setTemplateImage: (v) => calls.push(['template', v]) }
    const { createTray } = loadSource('src/main/tray.ts', {
      electron: {
        Menu: { buildFromTemplate: (items) => items },
        nativeImage: { createFromPath: (p) => { calls.push(['load', p]); return image } },
        Tray: class { setToolTip() {} setContextMenu() {} on() {} destroy() {} }
      },
      './utils/paths': { resourcePath: (...parts) => parts.join('/') }
    }, { process: { platform } })
    createTray({ labels: {}, getLaunchAtLogin: () => false })
    assert.equal(calls[0][1], platform === 'darwin' ? 'tray/trayTemplate.png' : 'tray/tray.png')
    assert.deepEqual(calls.slice(1), platform === 'darwin' ? [['template', true]] : [])
  }
})

test('packaging uses the approved ICNS and ships native resources where resourcePath reads them', () => {
  const config = require('js-yaml').load(fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8'))
  assert.equal(config.mac.icon, 'build/icon.icns')
  assert.ok(config.extraResources.some((r) => r.from === 'resources/tray' && r.to === 'tray'))
  assert.ok(config.extraResources.some((r) => r.from === 'resources/icon.png' && r.to === 'icon.png'))
  const pinned = {
    'app.svg': '0a8f7a464410981508a0943f0f2a5903ff33ad9a9d32f5efb2b20f6d5c7ac8eb',
    'mark.svg': 'b5bbfb83cf83e44f9634dfcf45088b1a37cc42cf718e9b71397e7650265ca4a4',
    'small-mark.svg': '2633872a9372a18d0804030a00d7ca884084566426f7714b2e523d152bf08b84',
    'app.icns': '1c01ee8d960f0b55979a3e3ecd891a0a871c44bdf0b1bb7493b347b221443fbe'
  }
  for (const [name, digest] of Object.entries(pinned)) {
    const bytes = fs.readFileSync(path.join(root, 'resources/brand', name))
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), digest, name + ' must remain the user-approved B2')
  }
  for (const [source, target] of [
    ['app.icns', 'build/icon.icns'], ['app-1024.png', 'build/icon.png'],
    ['app-1024.png', 'resources/icon.png'], ['mark-16.png', 'resources/tray/trayTemplate.png'],
    ['mark-32.png', 'resources/tray/trayTemplate@2x.png'], ['app-32.png', 'resources/tray/tray.png']
  ]) assert.deepEqual(fs.readFileSync(path.join(root, 'resources/brand', source)), fs.readFileSync(path.join(root, target)))
})
