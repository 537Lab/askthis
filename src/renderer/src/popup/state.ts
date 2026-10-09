import { create } from 'zustand'
import type { ActivatePayload, CaptureSource, PublicConfig, QueryEvent } from '@shared/types'

export type PopupStatus = 'idle' | 'waiting' | 'streaming' | 'done' | 'error'

export interface Turn {
  /** The question of this turn (captured text or follow-up). */
  q: string
  a: string
  reasoning: string
  error: string | null
  stopped: boolean
  elapsedMs: number | null
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
  addUserTurn(text: string): void
  markCopied(): void
}

function newTurn(q: string): Turn {
  return { q, a: '', reasoning: '', error: null, stopped: false, elapsedMs: null }
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
    set((s) => ({
      config: s.config,
      activationSeq: s.activationSeq + 1,
      status: payload.needsPermission ? 'error' : payload.autoQuery ? 'waiting' : 'idle',
      question: payload.text,
      questionSource: payload.source,
      truncated: !!payload.truncated,
      needsPermission: !!payload.needsPermission,
      turns:
        payload.text && !payload.needsPermission ? [newTurn(payload.text)] : [],
      model: '',
      copied: false
    })),

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
            last.elapsedMs = null
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

  markCopied: () => set({ copied: true })
}))
