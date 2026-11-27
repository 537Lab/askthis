import { useEffect, useState } from 'react'
import type { PlatformInfo } from '@shared/types'
import { GITHUB_URL, RELEASES_URL } from '@shared/constants'
import { useT, Section, Row, Button } from '../../shared/ui'
import { LogoIcon, CopyIcon, CheckIcon } from '../../shared/icons'
import { useSettingsStore } from '../store'

export function AboutSection(): React.JSX.Element {
  const t = useT()
  const config = useSettingsStore((s) => s.config)
  const [info, setInfo] = useState<PlatformInfo | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void window.api.app.platformInfo().then(setInfo)
  }, [])

  const copyDiagnostics = (): void => {
    const activeProvider = config?.providers.find((p) => p.id === config.activeProviderId)
    const lines = [
      `AskThis: ${info?.appVersion ?? 'unknown'}`,
      `Electron: ${info?.electronVersion ?? 'unknown'}`,
      `OS: ${info ? `${info.osVersion} (${info.arch}, ${info.platform})` : 'unknown'}`,
      `Locale: ${config?.locale ?? 'unknown'}`,
      `Theme: ${config?.theme ?? 'unknown'}`,
      `SelectionMode: ${config?.selectionMode ?? 'unknown'} (clipboardFallback=${String(config?.clipboardFallback)})`,
      `Provider: ${activeProvider ? `${activeProvider.name} (${activeProvider.kind})` : 'none'}`,
      `Model: ${config?.activeModelId || 'none'} (reasoning=${config?.reasoningLevel ?? 'unknown'})`
    ]
    void navigator.clipboard?.writeText(lines.join('\n')).catch(() => {})
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="about">
      <div className="about__hero">
        <LogoIcon size={44} />
        <div className="about__name">AskThis</div>
        <div className="about__tagline">{t('app.tagline')}</div>
      </div>

      <p className="about__desc">{t('about.desc')}</p>

      <Section>
        <Row label={t('about.version')}>
          <span className="at-hint">{info?.appVersion ?? '—'}</span>
        </Row>
        <Row label={t('about.electron')}>
          <span className="at-hint">{info?.electronVersion ?? '—'}</span>
        </Row>
        <Row label={t('about.os')}>
          <span className="at-hint">{info ? `${info.osVersion} (${info.arch})` : '—'}</span>
        </Row>
        <Row label={t('about.license')}>
          <span className="at-hint">MIT</span>
        </Row>
      </Section>

      <div className="about__links">
        <Button size="sm" onClick={() => window.api.app.openExternal(GITHUB_URL)}>
          {t('about.github')}
        </Button>
        <Button size="sm" onClick={copyDiagnostics}>
          {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
          <span>{copied ? t('about.diagnosticsCopied') : t('about.copyDiagnostics')}</span>
        </Button>
        <Button size="sm" variant="primary" onClick={() => window.api.app.openExternal(RELEASES_URL)}>
          {t('about.checkUpdates')}
        </Button>
      </div>
      <p className="about__made">{t('about.madeWith')}</p>
    </div>
  )
}
