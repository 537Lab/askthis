import { useEffect, useState } from 'react'
import type { AccessibilityStatus } from '@shared/types'
import { DEFAULT_SHORTCUT } from '@shared/defaults'
import { useT, Section, Row, Button, Kbd, prettyAccelerator } from '../../shared/ui'
import { useSettingsStore } from '../store'

export function InteractionSection(): React.JSX.Element {
  const t = useT()
  const config = useSettingsStore((s) => s.config)!
  const patch = useSettingsStore((s) => s.patch)
  const [recording, setRecording] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [accStatus, setAccStatus] = useState<AccessibilityStatus | null>(null)

  /* accessibility status (refresh whenever the window regains focus) */
  useEffect(() => {
    const refresh = (): void => {
      void window.api.app.accessibilityStatus().then(setAccStatus)
    }
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])

  /* shortcut conflict status on mount */
  useEffect(() => {
    void window.api.app.shortcutStatus().then((s) => setConflict(!s.ok))
  }, [])

  /* shortcut recording */
  useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setRecording(false)
        return
      }
      const accel = buildAccelerator(e)
      if (!accel) return
      setRecording(false)
      void patch({ shortcut: accel }).then(() => {
        void window.api.app.shortcutStatus().then((s) => setConflict(!s.ok))
      })
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, patch])

  return (
    <>
      <Section title={t('shortcut.section')}>
        <div className="shortcut-box">
          <div className="shortcut-display">
            {recording ? (
              <span className="recording-hint">{t('shortcut.recording')}</span>
            ) : (
              <>
                <Kbd accelerator={config.shortcut} />
                <span className="at-hint">{t('shortcut.desc')}</span>
              </>
            )}
          </div>
          <div className="form-actions">
            {recording ? (
              <Button size="sm" onClick={() => setRecording(false)}>
                {t('common.cancel')}
              </Button>
            ) : (
              <Button size="sm" variant="primary" onClick={() => setRecording(true)}>
                {t('shortcut.change')}
              </Button>
            )}
            {config.shortcut !== DEFAULT_SHORTCUT ? (
              <Button
                size="sm"
                onClick={() => {
                  void patch({ shortcut: DEFAULT_SHORTCUT }).then(() => {
                    void window.api.app.shortcutStatus().then((s) => setConflict(!s.ok))
                  })
                }}
              >
                {t('shortcut.reset')}
              </Button>
            ) : null}
          </div>
        </div>
        {conflict ? (
          <Row label={t('shortcut.conflict')}>
            <span className="at-badge at-badge--danger">!</span>
          </Row>
        ) : null}
      </Section>

      {accStatus?.canPrompt ? (
        <Section title={t('interaction.permission')}>
          <Row
            label={t('interaction.permission.accessibility')}
            desc={t('interaction.permission.accessibilityDesc')}
          >
            {accStatus.trusted ? (
              <div className="form-actions">
                <span className="at-badge at-badge--success">
                  {t('interaction.permission.granted')}
                </span>
                <Button size="sm" onClick={() => window.api.app.relaunch()}>
                  {t('interaction.permission.relaunch')}
                </Button>
              </div>
            ) : (
              <div className="form-actions">
                <Button size="sm" variant="primary" onClick={() => window.api.app.promptAccessibility()}>
                  {t('interaction.permission.grant')}
                </Button>
                <Button size="sm" onClick={() => window.api.app.openAccessibilitySettings()}>
                  {t('interaction.permission.openSettings')}
                </Button>
              </div>
            )}
          </Row>
        </Section>
      ) : null}
    </>
  )
}

/* ============================== accelerator recording ============================== */

function buildAccelerator(e: KeyboardEvent): string | null {
  const isMac = navigator.platform.toLowerCase().includes('mac')
  const mods: string[] = []

  if (isMac) {
    if (e.metaKey) mods.push('CommandOrControl')
    if (e.ctrlKey) mods.push('Control')
  } else {
    if (e.ctrlKey) mods.push('CommandOrControl')
    if (e.metaKey) mods.push('Super')
  }
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')

  const key = keyName(e)
  if (!key) return null
  if (mods.length === 0) return null
  return [...mods, key].join('+')
}

function keyName(e: KeyboardEvent): string | null {
  const k = e.key
  if (k === 'Shift' || k === 'Control' || k === 'Alt' || k === 'Meta') return null
  if (k === ' ') return 'Space'
  if (k === 'Enter') return 'Return'
  if (/^F\d{1,2}$/.test(k)) return k
  if (k.length === 1) {
    const upper = k.toUpperCase()
    if (/[A-Z0-9]/.test(upper)) return upper
    const punct: Record<string, string> = {
      ',': 'Comma',
      '.': 'Period',
      '/': 'Slash',
      ';': 'Semicolon',
      "'": 'Quote',
      '[': 'BracketLeft',
      ']': 'BracketRight',
      '\\': 'Backslash',
      '-': 'Minus',
      '=': 'Equal',
      '`': 'Backquote'
    }
    return punct[k] ?? null
  }
  const named: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Insert: 'Insert',
    Delete: 'Delete',
    Backspace: 'Backspace',
    Tab: 'Tab'
  }
  return named[k] ?? null
}
