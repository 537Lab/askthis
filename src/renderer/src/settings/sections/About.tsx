import { useEffect, useState } from 'react'
import type { PlatformInfo } from '@shared/types'
import { GITHUB_URL, RELEASES_URL } from '@shared/constants'
import { useT, Section, Row, Button } from '../../shared/ui'
import { LogoIcon } from '../../shared/icons'

export function AboutSection(): React.JSX.Element {
  const t = useT()
  const [info, setInfo] = useState<PlatformInfo | null>(null)

  useEffect(() => {
    void window.api.app.platformInfo().then(setInfo)
  }, [])

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
        <Button size="sm" variant="primary" onClick={() => window.api.app.openExternal(RELEASES_URL)}>
          {t('about.checkUpdates')}
        </Button>
      </div>
      <p className="about__made">{t('about.madeWith')}</p>
    </div>
  )
}
