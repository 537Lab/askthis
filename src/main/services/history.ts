import { join } from 'node:path'
import type { HistoryEntry } from '@shared/types'
import { readJsonSafe, writeFileAtomic } from '../utils/fs'

export class HistoryStore {
  private path: string
  private entries: HistoryEntry[] = []

  constructor(dir: string) {
    this.path = join(dir, 'history.json')
    this.entries = readJsonSafe<HistoryEntry[]>(this.path) ?? []
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
