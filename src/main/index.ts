import { app } from 'electron'
import { AskThisApp } from './app'

let askthis: AskThisApp | null = null

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    void askthis?.openQuickLook()
  })

  app.whenReady()
    .then(() => {
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
