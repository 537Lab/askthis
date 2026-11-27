import { join } from 'node:path'
import type { HistoryEntry } from '@shared/types'
import { readJsonSafe, writeFileAtomic } from '../utils/fs'

export class HistoryStore {
  private path: string
  private entries: HistoryEntry[] = []

  constructor(dir: string) {
    this.path = join(dir, 'history.json')
    const raw = readJsonSafe<unknown>(this.path)
    this.entries = Array.isArray(raw)
      ? raw.filter(
          (e): e is HistoryEntry =>
            !!e && typeof e === 'object' && typeof (e as HistoryEntry).id === 'string' && typeof (e as HistoryEntry).ts === 'number'
        )
      : []
  }

  list(limit?: number): HistoryEntry[] {
    return typeof limit === 'number' ? this.entries.slice(0, limit) : [...this.entries]
  }

  add(entry: HistoryEntry, limit: number): void {
    if (limit <= 0) return
    this.entries.unshift(entry)
    if (this.entries.length > limit) this.entries = this.entries.slice(0, limit)
    this.persist()
  }

  /** 按 sessionId 合并更新同会话历史，避免追问或重新生成产生重复记录 */
  upsertBySession(entry: HistoryEntry, limit: number): void {
    if (limit <= 0) return
    if (entry.sessionId) {
      this.entries = this.entries.filter((e) => e.sessionId !== entry.sessionId)
    }
    this.entries.unshift(entry)
    if (this.entries.length > limit) this.entries = this.entries.slice(0, limit)
    this.persist()
  }

  /** 删除单条历史记录 */
  remove(id: string): boolean {
    const idx = this.entries.findIndex((e) => e.id === id)
    if (idx < 0) return false
    this.entries.splice(idx, 1)
    this.persist()
    return true
  }

  clear(): void {
    this.entries = []
    this.persist()
  }

  private persist(): void {
    try {
      writeFileAtomic(this.path, JSON.stringify(this.entries, null, 2), 0o600)
    } catch (err) {
      console.warn('[history] persist failed:', err)
    }
  }
}
