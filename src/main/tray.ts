import { Menu, Tray, nativeImage } from 'electron'
import { resourcePath } from './utils/paths'

let tray: Tray | null = null

export interface TrayLabels {
  open: string
  prompts?: string
  settings: string
  launchAtLogin: string
  quit: string
  tip: string
}

export interface TrayPromptItem {
  id: string
  name: string
  active: boolean
}

export interface TrayOptions {
  labels: TrayLabels
  onOpen: () => void
  onSettings: () => void
  onToggleLaunchAtLogin: () => void
  onQuit: () => void
  getLaunchAtLogin: () => boolean
  prompts?: TrayPromptItem[]
  onSelectPrompt?: (id: string) => void
}

function buildTrayMenu(opts: TrayOptions): Electron.Menu {
  const promptItem: Electron.MenuItemConstructorOptions[] = opts.prompts?.length
    ? [
        {
          label: opts.labels.prompts ?? 'Active prompt',
          submenu: opts.prompts.map((p) => ({
            label: p.name,
            type: 'radio' as const,
            checked: p.active,
            click: () => opts.onSelectPrompt?.(p.id)
          }))
        }
      ]
    : []

  return Menu.buildFromTemplate([
    { label: opts.labels.open, click: opts.onOpen },
    ...promptItem,
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
}

export function createTray(opts: TrayOptions): void {
  destroyTray()

  const filename = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png'
  let image = nativeImage.createFromPath(resourcePath('tray', filename))
  if (image.isEmpty()) {
    // fallback: build a tiny dot so the tray still appears during development
    image = nativeImage.createEmpty()
  }
  if (process.platform === 'darwin') image.setTemplateImage(true)

  tray = new Tray(image)
  tray.setToolTip(opts.labels.tip)
  tray.setContextMenu(buildTrayMenu(opts))

  if (process.platform === 'win32') {
    tray.on('click', () => opts.onOpen())
  }
}

export function refreshTrayMenu(opts: TrayOptions): void {
  if (!tray) return
  tray.setContextMenu(buildTrayMenu(opts))
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
