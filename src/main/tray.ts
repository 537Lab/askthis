import { Menu, Tray, nativeImage } from 'electron'
import { resourcePath } from './utils/paths'

let tray: Tray | null = null

export interface TrayLabels {
  open: string
  settings: string
  launchAtLogin: string
  quit: string
  tip: string
}

export function createTray(opts: {
  labels: TrayLabels
  onOpen: () => void
  onSettings: () => void
  onToggleLaunchAtLogin: () => void
  onQuit: () => void
  getLaunchAtLogin: () => boolean
}): void {
  destroyTray()

  let image = nativeImage.createFromPath(resourcePath('tray', 'trayTemplate.png'))
  if (image.isEmpty()) {
    // fallback: build a tiny dot so the tray still appears during development
    image = nativeImage.createEmpty()
  }
  if (process.platform === 'darwin') image.setTemplateImage(true)

  tray = new Tray(image)
  tray.setToolTip(opts.labels.tip)

  const menu = Menu.buildFromTemplate([
    { label: opts.labels.open, click: opts.onOpen },
    { label: opts.labels.settings, click: opts.onSettings },
    { type: 'separator' },
    {
      label: opts.labels.launchAtLogin,
      type: 'checkbox',
      checked: opts.getLaunchAtLogin(),
      click: opts.onToggleLaunchAtLogin
    },
    { type: 'separator' },
    { label: opts.labels.quit, click: opts.onQuit }
  ])
  tray.setContextMenu(menu)

  if (process.platform === 'win32') {
    tray.on('click', () => opts.onOpen())
  }
}

export function refreshTrayMenu(opts: {
  labels: TrayLabels
  onOpen: () => void
  onSettings: () => void
  onToggleLaunchAtLogin: () => void
  onQuit: () => void
  getLaunchAtLogin: () => boolean
}): void {
  if (!tray) return
  const menu = Menu.buildFromTemplate([
    { label: opts.labels.open, click: opts.onOpen },
    { label: opts.labels.settings, click: opts.onSettings },
    { type: 'separator' },
    {
      label: opts.labels.launchAtLogin,
      type: 'checkbox',
      checked: opts.getLaunchAtLogin(),
      click: opts.onToggleLaunchAtLogin
    },
    { type: 'separator' },
    { label: opts.labels.quit, click: opts.onQuit }
  ])
  tray.setContextMenu(menu)
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
