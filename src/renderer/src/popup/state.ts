import { create } from 'zustand'
import type { ActivatePayload, CaptureSource, PublicConfig, QueryEvent, UsageInfo } from '@shared/types'

export type PopupStatus = 'idle' | 'waiting' | 'streaming' | 'done' | 'error'

export interface Turn {
  /** The question of this turn (captured text or follow-up). */
  q: string
  a: string
  reasoning: string
  error: string | null
  stopped: boolean
  incomplete: boolean
  elapsedMs: number | null
  usage?: UsageInfo | null
}

export interface PopupStore {
  config: PublicConfig | null
  /** bumped on every activation — lets effects reset per session */
  activationSeq: number
  status: PopupStatus
  question: string
  questionSource: CaptureSource
  truncated: boolean
  needsPermission: boolean
  turns: Turn[]
  model: string
  copied: boolean

  setConfig(config: PublicConfig): void
  applyActivate(payload: ActivatePayload): void
  applyEvent(event: QueryEvent): void
  applyDeltas(items: Array<{ channel: 'text' | 'reasoning'; delta: string }>): void
  addUserTurn(text: string): void
  markCopied(): void
}

function newTurn(q: string): Turn {
  return { q, a: '', reasoning: '', error: null, stopped: false, incomplete: false, elapsedMs: null, usage: null }
}

export const usePopupStore = create<PopupStore>((set) => ({
  config: null,
  activationSeq: 0,
  status: 'idle',
  question: '',
  questionSource: 'none',
  truncated: false,
  needsPermission: false,
  turns: [],
  model: '',
  copied: false,

  setConfig: (config) => set({ config }),

  applyActivate: (payload) =>
    set((s) => {
      const restored = payload.restoredTurns?.length
        ? payload.restoredTurns.map((t) => ({
            ...newTurn(t.q),
            a: t.a
          }))
        : null
      return {
        config: s.config,
        activationSeq: s.activationSeq + 1,
        status: restored
          ? 'done'
          : payload.needsPermission
            ? 'error'
            : payload.autoQuery
              ? 'waiting'
              : 'idle',
        question: payload.text,
        questionSource: payload.source,
        truncated: !!payload.truncated,
        needsPermission: !!payload.needsPermission,
        turns: restored ?? (payload.text && !payload.needsPermission ? [newTurn(payload.text)] : []),
        model: payload.restoredModel ?? '',
        copied: false
      }
    }),

  addUserTurn: (text) =>
    set((s) => ({
      turns: [...s.turns, newTurn(text)],
      status: 'waiting'
    })),

  applyEvent: (event) =>
    set((s) => {
      const turns = [...s.turns]
      const idx = turns.length - 1
      const last: Turn | null = idx >= 0 ? { ...turns[idx] } : null

      switch (event.type) {
        case 'start': {
          if (last) {
            last.a = ''
            last.reasoning = ''
            last.error = null
            last.stopped = false
            last.incomplete = false
            last.elapsedMs = null
            last.usage = null
            turns[idx] = last
          }
          return { status: 'streaming', model: event.model, turns }
        }
        case 'delta': {
          if (last) {
            if (event.channel === 'text') last.a += event.delta
            else last.reasoning += event.delta
            turns[idx] = last
          }
          return { turns }
        }
        case 'done': {
          if (last) {
            last.elapsedMs = event.elapsedMs
            last.incomplete = !!event.incomplete
            last.usage = event.usage ?? null
            turns[idx] = last
          }
          return { status: 'done', turns }
        }
        case 'aborted': {
          if (last) {
            last.stopped = true
            turns[idx] = last
          }
          return { status: 'done', turns }
        }
        case 'error': {
          if (last) {
            last.error = event.message
            turns[idx] = last
          }
          return { status: 'error', turns }
        }
        default:
          return {}
      }
    }),

  applyDeltas: (items) =>
    set((s) => {
      if (!items.length || !s.turns.length) return {}
      const turns = [...s.turns]
      const idx = turns.length - 1
      const last = { ...turns[idx] }
      for (const item of items) {
        if (item.channel === 'text') last.a += item.delta
        else last.reasoning += item.delta
      }
      turns[idx] = last
      return { turns }
    }),

  markCopied: () => set({ copied: true })
}))
