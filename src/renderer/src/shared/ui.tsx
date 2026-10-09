import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties
} from 'react'
import { t, resolveLocale, type UiLocale } from '@shared/i18n'

/* ============================== i18n context ============================== */

const LocaleContext = createContext<UiLocale>('zh-CN')

export function LocaleProvider({
  locale,
  children
}: {
  locale: UiLocale
  children: ReactNode
}): React.JSX.Element {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}

export function useLocale(): UiLocale {
  return useContext(LocaleContext)
}

export function useT(): (key: string, vars?: Record<string, string | number>) => string {
  const locale = useContext(LocaleContext)
  return (key, vars) => t(locale, key, vars)
}

export { resolveLocale }

/* ============================== layout helpers ============================== */

export function Spinner({ size = 14 }: { size?: number }): React.JSX.Element {
  return <span className="at-spinner" style={{ width: size, height: size }} />
}

export function Button({
  children,
  variant = 'default',
  size,
  onClick,
  disabled,
  title,
  style
}: {
  children: ReactNode
  variant?: 'default' | 'primary' | 'ghost' | 'danger'
  size?: 'sm'
  onClick?: () => void
  disabled?: boolean
  title?: string
  style?: CSSProperties
}): React.JSX.Element {
  const cls = ['at-btn']
  if (variant !== 'default') cls.push(`at-btn--${variant}`)
  if (size === 'sm') cls.push('at-btn--sm')
  return (
    <button className={cls.join(' ')} onClick={onClick} disabled={disabled} title={title} style={style}>
      {children}
    </button>
  )
}

export function IconButton({
  children,
  onClick,
  title,
  disabled
}: {
  children: ReactNode
  onClick?: () => void
  title?: string
  disabled?: boolean
}): React.JSX.Element {
  return (
    <button className="at-iconbtn" onClick={onClick} title={title} disabled={disabled}>
      {children}
    </button>
  )
}

export function Switch({
  checked,
  onChange
}: {
  checked: boolean
  onChange: (next: boolean) => void
}): React.JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={checked}
      className={`at-switch${checked ? ' at-switch--on' : ''}`}
      onClick={() => onChange(!checked)}
    />
  )
}

/* ============================== form fields ============================== */

/**
 * Text input / textarea that keeps a local draft while typing and commits
 * on blur, Enter (single line) or unmount. External value changes are
 * adopted when they don't echo our own commit.
 */
export function Field({
  value,
  onCommit,
  multiline = false,
  mono = false,
  placeholder,
  rows,
  disabled,
  width,
  secret = false
}: {
  value: string
  onCommit: (v: string) => void
  multiline?: boolean
  mono?: boolean
  placeholder?: string
  rows?: number
  disabled?: boolean
  width?: number
  secret?: boolean
}): React.JSX.Element {
  const [local, setLocal] = useState(value)
  const lastSent = useRef(value)
  const localRef = useRef(local)
  localRef.current = local
  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit

  useEffect(() => {
    if (value !== lastSent.current) {
      lastSent.current = value
      setLocal(value)
      localRef.current = value
    }
  }, [value])

  const commit = (): void => {
    const v = localRef.current
    if (v !== lastSent.current) {
      lastSent.current = v
      onCommitRef.current(v)
    }
  }

  useEffect(() => {
    return () => {
      const v = localRef.current
      if (v !== lastSent.current) onCommitRef.current(v)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (multiline) {
    return (
      <textarea
        className={`at-textarea${mono ? ' at-textarea--mono' : ''}`}
        value={local}
        rows={rows ?? 5}
        placeholder={placeholder}
        disabled={disabled}
        style={width ? { width } : undefined}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
      />
    )
  }
  return (
    <input
      className="at-input"
      type={secret ? 'password' : 'text'}
      value={local}
      placeholder={placeholder}
      disabled={disabled}
      style={width ? { width } : undefined}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}

export function NumberField({
  value,
  onCommit,
  min,
  max,
  width = 88,
  suffix,
  disabled
}: {
  value: number
  onCommit: (v: number) => void
  min?: number
  max?: number
  width?: number
  suffix?: string
  disabled?: boolean
}): React.JSX.Element {
  const [local, setLocal] = useState(String(value))
  const lastSent = useRef(value)
  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit

  useEffect(() => {
    if (value !== lastSent.current) {
      lastSent.current = value
      setLocal(String(value))
    }
  }, [value])

  const commit = (): void => {
    let n = Number.parseInt(local, 10)
    if (!Number.isFinite(n)) {
      setLocal(String(lastSent.current))
      return
    }
    if (min != null) n = Math.max(min, n)
    if (max != null) n = Math.min(max, n)
    setLocal(String(n))
    if (n !== lastSent.current) {
      lastSent.current = n
      onCommitRef.current(n)
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <input
        className="at-input"
        style={{ width, textAlign: 'center' }}
        inputMode="numeric"
        value={local}
        disabled={disabled}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            ;(e.target as HTMLInputElement).blur()
          }
        }}
      />
      {suffix ? <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{suffix}</span> : null}
    </span>
  )
}

export function Row({
  label,
  desc,
  children,
  stack
}: {
  label: string
  desc?: string
  children?: ReactNode
  stack?: boolean
}): React.JSX.Element {
  return (
    <div className={`at-row${stack ? ' at-row--stack' : ''}`}>
      <div className="at-row__text">
        <div className="at-row__label">{label}</div>
        {desc ? <div className="at-row__desc">{desc}</div> : null}
      </div>
      <div className="at-row__control">{children}</div>
    </div>
  )
}

export function Section({
  title,
  children
}: {
  title?: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <section className="at-section">
      {title ? <h3 className="at-section__title">{title}</h3> : null}
      <div className="at-card">{children}</div>
    </section>
  )
}

export function Kbd({ accelerator }: { accelerator: string }): React.JSX.Element {
  const parts = accelerator.split('+')
  return (
    <span className="at-kbd">
      {parts.map((p, i) => (
        <kbd key={i}>{prettyKey(p)}</kbd>
      ))}
    </span>
  )
}

export function prettyKey(part: string): string {
  switch (part) {
    case 'CommandOrControl':
    case 'CmdOrCtrl':
      return navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'
    case 'Command':
    case 'Cmd':
    case 'Super':
      return navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Win'
    case 'Alt':
    case 'Option':
      return navigator.platform.toLowerCase().includes('mac') ? '⌥' : 'Alt'
    case 'Shift':
      return navigator.platform.toLowerCase().includes('mac') ? '⇧' : 'Shift'
    case 'Control':
    case 'Ctrl':
      return navigator.platform.toLowerCase().includes('mac') ? '⌃' : 'Ctrl'
    case 'Space':
      return 'Space'
    case 'Escape':
      return 'Esc'
    default:
      return part
  }
}

/** Pretty-print an Electron accelerator for display, e.g. "⌥⇧D". */
export function prettyAccelerator(accelerator: string): string {
  const isMac = navigator.platform.toLowerCase().includes('mac')
  const parts = accelerator.split('+')
  const mods: string[] = []
  let key = ''
  for (const p of parts) {
    switch (p) {
      case 'CommandOrControl':
      case 'CmdOrCtrl':
        mods.push(isMac ? '⌘' : 'Ctrl')
        break
      case 'Command':
      case 'Cmd':
      case 'Super':
        mods.push(isMac ? '⌘' : 'Win')
        break
      case 'Alt':
      case 'Option':
        mods.push(isMac ? '⌥' : 'Alt')
        break
      case 'Shift':
        mods.push(isMac ? '⇧' : 'Shift')
        break
      case 'Control':
      case 'Ctrl':
        mods.push(isMac ? '⌃' : 'Ctrl')
        break
      default:
        key = p
    }
  }
  return isMac ? `${mods.join('')}${key}` : [...mods, key].join('+')
}
