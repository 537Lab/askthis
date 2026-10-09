import { app, session } from 'electron'
import { AskThisApp } from './app'

let askthis: AskThisApp | null = null

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  // Re-launching the app (double-click, a second `open`, …) surfaces the
  // settings window instead of doing nothing visible.
  app.on('second-instance', () => {
    void askthis?.openSettings()
  })

  // macOS: re-opening the running app (Dock / Finder) fires `activate`.
  // The first one fires as part of the normal launch sequence — skip it so a
  // login-item start stays silent; later ones mean the user clicked the icon.
  let launchActivate = true
  app.on('activate', () => {
    if (launchActivate) {
      launchActivate = false
      return
    }
    void askthis?.openSettings()
  })

  app.whenReady()
    .then(() => {
      // Security: AskThis needs no renderer permissions — deny all requests (camera, mic,
      // notifications, geolocation, …) and all synchronous permission checks.
      session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
        callback(false)
      )
      session.defaultSession.setPermissionCheckHandler(() => false)

      askthis = new AskThisApp()
      askthis.start()
    })
    .catch((err) => {
      console.error('[main] startup failed:', err)
    })

  process.on('unhandledRejection', (reason) => {
    console.warn('[main] unhandled rejection:', reason)
  })

  // Tray app: keep running when all windows are closed.
  app.on('window-all-closed', () => {
    /* keep alive */
  })

  app.on('before-quit', () => {
    askthis?.shutdown()
    askthis = null
  })
}
