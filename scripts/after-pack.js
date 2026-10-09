// electron-builder afterPack hook: ad-hoc sign the macOS app with the
// entitlements Electron needs (JIT, unsigned executable memory, library
// validation). Without them the renderer loses V8 JIT and, on some macOS
// versions, transparent windows fail to composite — the app runs but its
// popup never appears on screen.
const { execSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  const entitlements = path.join(
    context.packager.info.projectDir,
    'node_modules/app-builder-lib/templates/entitlements.mac.plist'
  )
  console.log(`[afterPack] ad-hoc signing ${appPath}`)
  execSync(`codesign --force --deep --sign - --entitlements "${entitlements}" "${appPath}"`, {
    stdio: 'inherit'
  })
  execSync(`codesign --verify --verbose=1 "${appPath}"`, { stdio: 'inherit' })
}
