import { app } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Absolute path to a bundled resource (dev and packaged builds). */
export function resourcePath(...parts: string[]): string {
  return app.isPackaged
    ? join(process.resourcesPath, ...parts)
    : join(app.getAppPath(), 'resources', ...parts)
}

/** Renderer entry for a page (dev server URL in dev, file path in production). */
export function rendererEntry(page: 'popup' | 'settings'): { devUrl?: string; file: string } {
  // Only trust ELECTRON_RENDERER_URL in development — a packaged app must
  // never load a page chosen by the environment it was launched in.
  const devUrl = !app.isPackaged ? process.env['ELECTRON_RENDERER_URL'] : undefined
  if (devUrl) return { devUrl, file: '' }
  return { file: join(__dirname, '../renderer', `${page}.html`) }
}

/** True when `url` is exactly one of the app's own renderer pages. */
export function isTrustedRendererUrl(url: string, page?: 'popup' | 'settings'): boolean {
  const check = (p: 'popup' | 'settings'): boolean => {
    const entry = rendererEntry(p)
    const base = entry.devUrl ? `${entry.devUrl}/${p}.html` : pathToFileURL(entry.file).href
    return url === base || url.startsWith(`${base}?`) || url.startsWith(`${base}#`)
  }
  return page ? check(page) : check('popup') || check('settings')
}

/** Preload script path (built next to the main bundle). */
export function preloadPath(): string {
  return join(__dirname, '../preload/index.js')
}
