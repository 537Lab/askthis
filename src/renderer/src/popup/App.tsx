import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { UiLocale } from '@shared/i18n'
import { resolveLocale } from '@shared/i18n'
import { usePopupStore, type PopupStatus, type Turn } from './state'
import { LocaleProvider, useT, Button, IconButton, Spinner } from '../shared/ui'
import { CloseIcon, CopyIcon, CheckIcon, StopIcon, LockIcon, LogoIcon, RefreshIcon } from '../shared/icons'
import { Markdown } from '../shared/markdown'
import type { CaptureSource } from '@shared/types'

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
    const unEvents = window.api.popup.onQueryEvent((event) => usePopupStore.getState().applyEvent(event))
    void window.api.config.get().then((cfg) => usePopupStore.getState().setConfig(cfg))
    return () => { un(); unEvents() }
  }, [])
  useEffect(() => {
    if (config) setLocale(resolveLocale(config.locale, navigator.language))
  }, [config])
  return <LocaleProvider locale={locale}><PopupCard /></LocaleProvider>
}

function PopupCard(): React.JSX.Element {
  const t = useT()
  const store = usePopupStore()
  const shellRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const followingRef = useRef(true)
  const [draft, setDraft] = useState('')
  const [showLatest, setShowLatest] = useState(false)
  const busy = store.status === 'waiting' || store.status === 'streaming'
  const hasTurns = store.turns.length > 0
  const cfg = store.config
  const maxH = cfg?.maxWindowHeight ?? 560
  const maxInputHeight = Math.min(108, Math.max(26, maxH - 170))
  const level = cfg?.reasoningLevel
  const modelLabel = (store.model || cfg?.activeModelId || '') + (level && level !== 'off' ? ` · ${level}` : '')
  const last = store.turns[store.turns.length - 1]

  // Grow naturally up to the user's cap. Native positioning/fullscreen behavior
  // stays in PopupWindow; no animated native resizes or focus changes here.
  useEffect(() => {
    const el = shellRef.current
    if (!el) return
    let lastHeight = 0
    let raf = 0
    const ro = new ResizeObserver(() => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const h = el.scrollHeight + 2
        if (Math.abs(h - lastHeight) > 1) {
          lastHeight = h
          window.api.popup.resize(h)
        }
        const body = bodyRef.current
        if (body && followingRef.current) body.scrollTop = body.scrollHeight
      })
    })
    ro.observe(el)
    for (const child of Array.from(el.children)) ro.observe(child)
    if (bodyRef.current) ro.observe(bodyRef.current)
    return () => { ro.disconnect(); if (raf) cancelAnimationFrame(raf) }
  }, [store.activationSeq])

  useEffect(() => {
    setDraft('')
    followingRef.current = true
    setShowLatest(false)
    if (!usePopupStore.getState().question) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 80)
      return () => window.clearTimeout(id)
    }
    return undefined
  }, [store.activationSeq])

  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, maxInputHeight)}px`
  }, [draft, store.activationSeq, maxInputHeight])

  // Follow new text only while the reader is at the bottom. Scrolling up is an
  // explicit opt-out; never drag someone away from an earlier answer.
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (body && followingRef.current) body.scrollTop = body.scrollHeight
  }, [store.turns, store.status])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229) return
      window.api.popup.close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const submit = (): void => {
    const text = draft.trim()
    if (!text || ['waiting', 'streaming'].includes(usePopupStore.getState().status)) return
    followingRef.current = true
    setShowLatest(false)
    setDraft('')
    usePopupStore.getState().addUserTurn(text)
    window.api.popup.send(text)
    inputRef.current?.focus()
  }

  return (
    <div className={`popup-shell${hasTurns ? '' : ' popup-shell--empty'}`} ref={shellRef} style={{ maxHeight: maxH }} data-status={store.status}>
      <div className="popup-card">
        <header className="head">
          <div className="head__drag">
            <span className="head__logo"><LogoIcon size={16} /></span>
            <span className="head__brand">AskThis</span>
            <span className="head__model" title={modelLabel}>{modelLabel}</span>
          </div>
          <IconButton title={t('popup.close')} onClick={() => window.api.popup.close()}><CloseIcon size={14} /></IconButton>
        </header>

        <div className="body" ref={bodyRef} hidden={!hasTurns && !store.needsPermission}
          onScroll={() => {
            const el = bodyRef.current
            if (!el) return
            const near = el.scrollHeight - el.scrollTop - el.clientHeight < 40
            followingRef.current = near
            setShowLatest(!near)
          }}>
          {store.needsPermission ? <PermissionCard /> : null}
          {store.truncated && hasTurns ? <div className="turn__note turn__note--truncated">{t('popup.truncated')}</div> : null}
          {store.turns.map((turn, i) => (
            <TurnView key={`${store.activationSeq}:${i}`} turn={turn} first={i === 0}
              source={i === 0 ? store.questionSource : null} isLast={i === store.turns.length - 1}
              status={store.status} showReasoning={cfg?.showReasoning ?? true} />
          ))}
          {store.status === 'error' && hasTurns ? (
            <div className="recovery">
              <Button size="sm" onClick={() => window.api.popup.regenerate()}>{t('popup.retry')}</Button>
              {needsSettings(last?.error) ? <Button size="sm" onClick={() => window.api.app.openSettings()}>{t('popup.noKey.action')}</Button> : null}
            </div>
          ) : null}
        </div>

        <div className={`composer${hasTurns ? ' composer--conversation' : ''}${draft.length ? ' composer--draft' : ''}`}>
          {showLatest ? <button className="latest" onClick={() => {
            followingRef.current = true
            setShowLatest(false)
            if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
          }}>↓ {t('popup.latest')}</button> : null}
          <div className="composer__field">
            <textarea ref={inputRef} className="composer__input" rows={1} value={draft} style={{ maxHeight: maxInputHeight }}
              aria-label={hasTurns ? t('popup.ask.placeholder') : t('popup.placeholder')}
              placeholder={hasTurns ? t('popup.ask.placeholder') : t('popup.placeholder')}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) {
                  e.preventDefault()
                  submit()
                }
              }} />
            {busy ? (
              <button className="composer__action composer__action--stop" aria-label={t('popup.stop')} title={t('popup.stop')} onClick={() => window.api.popup.stop()}><StopIcon size={13} /></button>
            ) : (
              <button className="composer__action" aria-label={t('popup.send')} title={t('popup.send')} disabled={!draft.trim()} onClick={submit}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6" /></svg>
              </button>
            )}
          </div>
          <footer className="composer__hints" hidden={hasTurns && !draft.length}>
            <span role="status">{busy ? t('popup.draftHint') : <><kbd>↵</kbd> {t('popup.sendHint')}<span className="hint-secondary"> · <kbd>⇧ ↵</kbd> {t('popup.newline')}</span></>}</span>
            <span><kbd>esc</kbd> {t('popup.close')}</span>
          </footer>
        </div>
      </div>
    </div>
  )
}

function TurnView({ turn, first, source, isLast, status, showReasoning }: {
  turn: Turn
  first: boolean
  source: CaptureSource | null
  isLast: boolean
  status: PopupStatus
  showReasoning: boolean
}): React.JSX.Element {
  const t = useT()
  const { q, a, reasoning, error, stopped, elapsedMs } = turn
  const active = isLast && (status === 'waiting' || status === 'streaming')
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<number | undefined>(undefined)
  useEffect(() => {
    setCopied(false)
    return () => window.clearTimeout(copyTimer.current)
  }, [a])
  return (
    <section className={`turn${first ? ' turn--first' : ''}`}>
      {q ? <div className="turn__q">
        <span className="turn__q-badge">{first ? t(`popup.source.${source && source !== 'none' ? source : 'manual'}`) : t('popup.followup')}</span>
        <div className="turn__q-text">{q}</div>
      </div> : null}
      {showReasoning && reasoning ? <details className="reason">
        <summary>{t('popup.reasoning')}</summary><div className="reason__body">{reasoning}</div>
      </details> : null}
      {active && !a ? <div className="waiting" role="status"><Spinner size={12} /><span>{t('popup.thinking')}</span></div> : null}
      {a ? <Markdown className="turn__a" text={a} /> : null}
      {active && a ? <span className="cursor" aria-label={t('popup.answering')} /> : null}
      {error ? <div className="turn__error" role="alert">{localizeError(error, t)}</div> : null}
      {stopped ? <div className="turn__note">{t('err.ABORTED')}</div> : null}
      {!active && (a || (isLast && status === 'done')) ? <div className="turn__actions">
        {a ? <button className="turn__action" aria-label={t('popup.copy')} onClick={() => {
          window.api.popup.copy(a)
          setCopied(true)
          window.clearTimeout(copyTimer.current)
          copyTimer.current = window.setTimeout(() => setCopied(false), 1600)
        }}>{copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}<span>{copied ? t('popup.copied') : t('popup.copy')}</span></button> : null}
        {isLast ? <button className="turn__action" aria-label={t('popup.regenerate')} onClick={() => window.api.popup.regenerate()}><RefreshIcon size={12} /><span>{t('popup.regenerate')}</span></button> : null}
        {elapsedMs != null ? <span className="turn__time">{formatMs(elapsedMs)}</span> : null}
      </div> : null}
    </section>
  )
}

function PermissionCard(): React.JSX.Element {
  const t = useT()
  return (
    <div className="permission">
      <div className="permission__title"><LockIcon size={14} /><span>{t('interaction.permission.accessibility')}</span></div>
      <p className="permission__desc">{t('interaction.permission.accessibilityDesc')}</p>
      <div className="permission__actions">
        <Button size="sm" variant="primary" onClick={() => window.api.app.promptAccessibility()}>{t('interaction.permission.grant')}</Button>
        <Button size="sm" onClick={() => window.api.app.openAccessibilitySettings()}>{t('interaction.permission.openSettings')}</Button>
        <Button size="sm" onClick={() => window.api.app.relaunch()}>{t('interaction.permission.relaunch')}</Button>
      </div>
    </div>
  )
}

const ERROR_TOKENS = ['NO_PROVIDER', 'NO_API_KEY', 'TIMEOUT', 'NEEDS_PERMISSION'] as const
function localizeError(msg: string, t: (key: string, vars?: Record<string, string | number>) => string): string {
  if ((ERROR_TOKENS as readonly string[]).includes(msg)) return t(`err.${msg}`)
  if (msg === 'request timed out') return t('err.TIMEOUT')
  return msg
}
function needsSettings(msg: string | null | undefined): boolean {
  return msg === 'NO_PROVIDER' || msg === 'NO_API_KEY'
}
function formatMs(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}
