import { BrowserWindow, screen, shell } from 'electron'
import type { AppConfig } from '@shared/types'

/**
 * The quick-look popup: a frameless, transparent, always-on-top card that
 * appears near the mouse cursor and never steals focus on show.
 */
export class PopupWindow {
  private win: BrowserWindow | null = null
  private userMoved = false
  /**
   * setBounds() also fires the window's 'moved' event — this counter lets the
   * 'moved' handler tell programmatic resizes apart from real user drags.
   */
  private programmaticMoves = 0

  constructor(
    private getConfig: () => AppConfig,
    private onBlurHide: () => void = () => {}
  ) {}

  get browserWindow(): BrowserWindow | null {
    return this.win
  }

  isVisible(): boolean {
    return !!this.win && this.win.isVisible()
  }

  ensureCreated(rendererUrl: { devUrl?: string; file: string }, preload: string): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win

    const win = new BrowserWindow({
      width: this.getConfig().windowWidth || 480,
      height: 132,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false, // CSS draws the shadow inside the transparent window
      acceptFirstMouse: true, // first click interacts instead of just focusing
      webPreferences: {
        preload,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false
      }
    })

    if (process.platform === 'darwin') {
      win.setAlwaysOnTop(true, 'floating')
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    }

    win.on('closed', () => {
      this.win = null
    })

    // Security: this window never navigates away from its own page.
    // External links open in the default browser instead.
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

    // Track real user drags only (programmatic setBounds is counted out).
    win.on('moved', () => {
      if (this.programmaticMoves > 0) {
        this.programmaticMoves--
        return
      }
      this.userMoved = true
    })

    // Optional: auto-hide when the window loses focus (off by default —
    // clicking outside must never dismiss the card accidentally).
    win.on('blur', () => {
      if (this.getConfig().hideOnBlur) this.onBlurHide()
    })

    this.win = win
    if (rendererUrl.devUrl) {
      void win.loadURL(`${rendererUrl.devUrl}/popup.html`)
      if (process.env.ASKTHIS_DEVTOOLS) {
        win.webContents.openDevTools({ mode: 'detach' })
      }
    } else {
      void win.loadFile(rendererUrl.file)
    }
    return win
  }

  /** setBounds wrapper that doesn't count as a user move. */
  private applyBounds(bounds: Electron.Rectangle): void {
    if (!this.win || this.win.isDestroyed()) return
    this.programmaticMoves++
    this.win.setBounds(bounds)
  }

  /** Position near the mouse, clamped to the display's work area. */
  position(): void {
    if (!this.win) return
    const cfg = this.getConfig()
    const width = cfg.windowWidth || 480
    const cursor = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursor)
    const area = display.workArea
    const h = this.win.getBounds().height

    let x = cursor.x + 16
    let y = cursor.y + 20
    x = Math.min(x, area.x + area.width - width - 12)
    y = Math.min(y, area.y + area.height - h - 12)
    x = Math.max(x, area.x + 12)
    y = Math.max(y, area.y + 12)

    // Keep the window fully on screen vertically as content grows.
    this.applyBounds({ x, y, width, height: h })
  }

  /** Show without stealing focus from the app the user is working in. */
  show(existingPosition: boolean): void {
    if (!this.win) return
    if (!existingPosition || !this.userMoved) this.position()
    if (process.platform === 'darwin') {
      this.win.showInactive()
    } else {
      this.win.show()
    }
  }

  setHeight(height: number): void {
    if (!this.win) return
    const cfg = this.getConfig()
    const maxH = cfg.maxWindowHeight || 560
    const h = Math.round(Math.min(Math.max(height, 96), maxH))
    const b = this.win.getBounds()
    if (b.height === h) return

    // grow/shrink downward but keep the popup inside the display
    const display = screen.getDisplayNearestPoint({ x: b.x, y: b.y })
    const area = display.workArea
    let y = b.y
    if (y + h > area.y + area.height - 8) {
      y = Math.max(area.y + 8, area.y + area.height - h - 8)
    }
    this.applyBounds({ x: b.x, y, width: b.width, height: h })
  }

  hide(): void {
    this.win?.hide()
    this.userMoved = false
  }

  close(): void {
    this.win?.close()
  }

  send(channel: string, payload?: unknown): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send(channel, payload)
    }
  }
}
