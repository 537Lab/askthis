import { useEffect, useRef, useState } from 'react'
import type { UiLocale } from '@shared/i18n'
import { resolveLocale } from '@shared/i18n'
import { usePopupStore, type PopupStatus } from './state'
import { LocaleProvider, useT, Button, IconButton, Spinner } from '../shared/ui'
import {
  CloseIcon,
  CopyIcon,
  CheckIcon,
  StopIcon,
  LockIcon,
  LogoIcon
} from '../shared/icons'
import { Markdown } from '../shared/markdown'
import type { CaptureSource } from '@shared/types'

/* ============================== app shell ============================== */

export function App(): React.JSX.Element {
  const config = usePopupStore((s) => s.config)
  const [locale, setLocale] = useState<UiLocale>(() =>
    resolveLocale('system', typeof navigator !== 'undefined' ? navigator.language : 'zh-CN')
  )

  useEffect(() => {
    const un = window.api.popup.onActivate((payload) => {
      usePopupStore.getState().applyActivate(payload)
      void window.api.config.get().then((cfg) => usePopupStore.getState().setConfig(cfg))
    })
    const unEvents = window.api.popup.onQueryEvent((event) => {
      usePopupStore.getState().applyEvent(event)
    })
    void window.api.config.get().then((cfg) => usePopupStore.getState().setConfig(cfg))
    return () => {
      un()
      unEvents()
    }
  }, [])

  useEffect(() => {
    if (config) setLocale(resolveLocale(config.locale, navigator.language))
  }, [config])

  return (
    <LocaleProvider locale={locale}>
      <PopupCard />
    </LocaleProvider>
  )
}

/* ============================== the card ============================== */

function PopupCard(): React.JSX.Element {
  const t = useT()
  const store = usePopupStore()
  const shellRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState('')

  /* window height follows content height */
  useEffect(() => {
    const el = shellRef.current
    if (!el) return
    let last = 0
    let raf = 0
    const report = (): void => {
      raf = 0
      const h = el.scrollHeight + 2
      if (Math.abs(h - last) > 1) {
        last = h
        window.api.popup.resize(h)
      }
    }
    const ro = new ResizeObserver(() => {
      if (!raf) raf = requestAnimationFrame(report)
    })
    ro.observe(el)
    for (const child of Array.from(el.children)) ro.observe(child)
    return () => {
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [store.activationSeq])

  /* reset draft + focus on every new activation */
  useEffect(() => {
    setDraft('')
    const s = usePopupStore.getState()
    if (!s.needsPermission && !s.question) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 80)
      return () => window.clearTimeout(id)
    }
    return undefined
  }, [store.activationSeq])

  /* Esc always closes the card */
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.api.popup.close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const cfg = store.config
  const maxH = cfg?.maxWindowHeight ?? 560
  const level = cfg?.reasoningLevel
  const modelLabel =
    (store.model || cfg?.activeModelId || t('app.name')) + (level && level !== 'off' ? ` · ${level}` : '')
  const last = store.turns[store.turns.length - 1]
  const waiting =
    store.status === 'waiting' ||
    (store.status === 'streaming' && !!last && !last.a && !last.reasoning && !last.error)

  const submit = (): void => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    usePopupStore.getState().addUserTurn(text)
    window.api.popup.send(text)
  }

  const copyAnswer = (): void => {
    const s = usePopupStore.getState()
    const l = s.turns[s.turns.length - 1]
    if (!l?.a) return
    window.api.popup.copy(l.a)
    s.markCopied()
    window.setTimeout(() => window.api.popup.close(), 420)
  }

  return (
    <div className="popup-shell" ref={shellRef} style={{ maxHeight: maxH }}>
      <div className="popup-card">
        <header className="head">
          <div className="head__drag">
            <span className="head__logo">
              <LogoIcon size={13} />
            </span>
            <span className="head__model" title={modelLabel}>
              {modelLabel}
            </span>
          </div>
          <div className="head__actions">
            <IconButton title={t('popup.close')} onClick={() => window.api.popup.close()}>
              <CloseIcon size={14} />
            </IconButton>
          </div>
        </header>

        <div className="body">
          {store.needsPermission ? (
            <PermissionCard />
          ) : (
            <>
              {store.turns.length === 0 && !waiting ? (
                <div className="empty">{t('popup.hint.empty')}</div>
              ) : null}
              {store.turns.map((turn, i) => (
                <TurnView
                  key={i}
                  index={i}
                  q={turn.q}
                  a={turn.a}
                  reasoning={turn.reasoning}
                  error={turn.error}
                  stopped={turn.stopped}
                  elapsedMs={turn.elapsedMs}
                  first={i === 0}
                  source={i === 0 ? store.questionSource : null}
                  isLast={i === store.turns.length - 1}
                  status={store.status}
                  waiting={waiting}
                  showReasoning={cfg?.showReasoning ?? true}
                />
              ))}
              {waiting ? (
                <div className="waiting">
                  <Spinner size={12} />
                  <span>{t('popup.thinking')}</span>
                </div>
              ) : null}
            </>
          )}
        </div>

        {!store.needsPermission ? (
          <div className="composer">
            <input
              ref={inputRef}
              className="composer__input"
              value={draft}
              placeholder={store.question ? t('popup.ask.placeholder') : t('popup.placeholder')}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  submit()
                }
              }}
              disabled={store.status === 'streaming' || store.status === 'waiting'}
            />
          </div>
        ) : null}

        <footer className="foot">
          <div className="foot__left">
            {store.status === 'streaming' ? (
              <Button size="sm" onClick={() => window.api.popup.stop()}>
                <StopIcon size={10} /> {t('popup.stop')}
              </Button>
            ) : null}
            {store.status === 'done' ? (
              <>
                <Button size="sm" variant="primary" onClick={copyAnswer}>
                  {store.copied ? <CheckIcon size={11} /> : <CopyIcon size={11} />}
                  {store.copied ? t('popup.copied') : t('popup.copy')}
                </Button>
                <Button size="sm" onClick={() => window.api.popup.regenerate()}>
                  {t('popup.regenerate')}
                </Button>
              </>
            ) : null}
            {store.status === 'error' && !store.needsPermission ? (
              <>
                <Button size="sm" variant="primary" onClick={() => window.api.popup.regenerate()}>
                  {t('popup.retry')}
                </Button>
                {needsSettings(last?.error) ? (
                  <Button size="sm" onClick={() => window.api.app.openSettings()}>
                    {t('popup.noKey.action')}
                  </Button>
                ) : null}
              </>
            ) : null}
            {!store.needsPermission ? (
              <Button size="sm" variant="ghost" onClick={() => window.api.popup.close()}>
                {t('popup.close')}
              </Button>
            ) : null}
          </div>
          <div className="foot__right">
            {store.status === 'done' && last?.elapsedMs != null ? (
              <span className="foot__meta">{formatMs(last.elapsedMs)}</span>
            ) : null}
            <span className="foot__meta">Esc</span>
          </div>
        </footer>
      </div>
    </div>
  )
}

/* ============================== pieces ============================== */

function TurnView(props: {
  index: number
  q: string
  a: string
  reasoning: string
  error: string | null
  stopped: boolean
  elapsedMs: number | null
  first: boolean
  source: CaptureSource | null
  isLast: boolean
  status: PopupStatus
  waiting: boolean
  showReasoning: boolean
}): React.JSX.Element {
  const t = useT()
  const { q, a, reasoning, error, stopped, first, source, isLast, showReasoning } = props
  const errorText = error ? localizeError(error, t) : null
  return (
    <div className={`turn${first ? ' turn--first' : ''}`}>
      {q ? (
        <div className="turn__q">
          {first && source && source !== 'none' ? (
            <span className="turn__q-badge">{t(`popup.source.${source}`)}</span>
          ) : null}
          <span className="turn__q-text">{q}</span>
        </div>
      ) : null}

      {showReasoning && reasoning ? (
        <details className="reason">
          <summary>{t('popup.reasoning')}</summary>
          <div className="reason__body">{reasoning}</div>
        </details>
      ) : null}

      {a ? <Markdown className="turn__a" text={a} /> : null}

      {errorText ? (
        <div className={`turn__error${needsSettings(error) ? ' turn__error--action' : ''}`}>
          {errorText}
        </div>
      ) : null}
      {stopped ? <div className="turn__note">{t('err.ABORTED')}</div> : null}
      {isLast && props.status === 'streaming' && a ? <span className="cursor" /> : null}
    </div>
  )
}

function PermissionCard(): React.JSX.Element {
  const t = useT()
  return (
    <div className="permission">
      <div className="permission__title">
        <LockIcon size={14} />
        <span>{t('interaction.permission.accessibility')}</span>
      </div>
      <p className="permission__desc">{t('interaction.permission.accessibilityDesc')}</p>
      <div className="permission__actions">
        <Button size="sm" variant="primary" onClick={() => window.api.app.promptAccessibility()}>
          {t('interaction.permission.grant')}
        </Button>
        <Button size="sm" onClick={() => window.api.app.openAccessibilitySettings()}>
          {t('interaction.permission.openSettings')}
        </Button>
        <Button size="sm" onClick={() => window.api.app.relaunch()}>
          {t('interaction.permission.relaunch')}
        </Button>
      </div>
    </div>
  )
}

/* ============================== helpers ============================== */

const ERROR_TOKENS = ['NO_PROVIDER', 'NO_API_KEY', 'TIMEOUT', 'NEEDS_PERMISSION'] as const

function isErrorToken(msg: string | null | undefined): msg is (typeof ERROR_TOKENS)[number] {
  return !!msg && (ERROR_TOKENS as readonly string[]).includes(msg)
}

function localizeError(
  msg: string,
  t: (key: string, vars?: Record<string, string | number>) => string
): string {
  if (isErrorToken(msg)) return t(`err.${msg}`)
  if (msg === 'request timed out') return t('err.TIMEOUT')
  return msg
}

function needsSettings(msg: string | null | undefined): boolean {
  return msg === 'NO_PROVIDER' || msg === 'NO_API_KEY'
}

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}
