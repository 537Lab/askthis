import { BrowserWindow, shell } from 'electron'

/**
 * The settings window — a normal window (hidden inset title bar on macOS)
 * with the standard column layout (sidebar + content).
 */
export class SettingsWindow {
  private win: BrowserWindow | null = null

  isOpen(): boolean {
    return !!this.win && !this.win.isDestroyed()
  }

  open(opts: { devUrl?: string; file: string; preload: string }): void {
    if (this.win && !this.win.isDestroyed()) {
      if (this.win.isMinimized()) this.win.restore()
      this.win.show()
      this.win.focus()
      return
    }

    const win = new BrowserWindow({
      width: 920,
      height: 640,
      minWidth: 780,
      minHeight: 540,
      show: false,
      title: 'AskThis',
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      backgroundColor: '#f6f7f9',
      webPreferences: {
        preload: opts.preload,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false
      }
    })

    win.once('ready-to-show', () => win.show())
    win.on('closed', () => {
      this.win = null
    })

    // All external links open in the default browser; this window never navigates.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^(https?:|mailto:)/i.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    win.webContents.on('will-navigate', (event, url) => {
      event.preventDefault()
      if (/^(https?:|mailto:)/i.test(url)) void shell.openExternal(url)
    })
    win.webContents.on('will-redirect', (event) => {
      event.preventDefault()
    })

    if (opts.devUrl) {
      void win.loadURL(`${opts.devUrl}/settings.html`)
    } else {
      void win.loadFile(opts.file)
    }

    this.win = win
  }

  send(channel: string, payload?: unknown): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send(channel, payload)
    }
  }

  close(): void {
    this.win?.close()
  }
}
