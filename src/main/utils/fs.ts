import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs'
import { dirname } from 'node:path'

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true })
}

export function readJsonSafe<T>(path: string): T | null {
  try {
    const raw = readFileSync(path, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/**
 * Write a file atomically (tmp file + rename), so a crash mid-write can
 * never corrupt an existing config.
 */
export function writeFileAtomic(path: string, data: string, mode?: number): void {
  ensureDir(dirname(path))
  const tmp = `${path}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`
  try {
    writeFileSync(tmp, data, mode != null ? { mode } : undefined)
    renameSync(tmp, path)
  } catch (err) {
    try {
      unlinkSync(tmp)
    } catch {
      /* 忽略清理失败 */
    }
    throw err
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
