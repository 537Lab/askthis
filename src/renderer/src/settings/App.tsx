import { useEffect, useState } from 'react'
import type { UiLocale } from '@shared/i18n'
import { resolveLocale } from '@shared/i18n'
import { LocaleProvider, useT } from '../shared/ui'
import {
  SlidersIcon,
  KeyIcon,
  MessageIcon,
  CommandIcon,
  InfoIcon,
  LogoIcon
} from '../shared/icons'
import { useSettingsStore } from './store'
import { GeneralSection } from './sections/General'
import { ProvidersSection } from './sections/Providers'
import { PromptsSection } from './sections/Prompts'
import { InteractionSection } from './sections/Interaction'
import { AboutSection } from './sections/About'

type TabId = 'general' | 'providers' | 'prompts' | 'interaction' | 'about'

const TABS: { id: TabId; labelKey: string; icon: React.JSX.Element }[] = [
  { id: 'general', labelKey: 'nav.general', icon: <SlidersIcon size={15} /> },
  { id: 'providers', labelKey: 'nav.providers', icon: <KeyIcon size={15} /> },
  { id: 'prompts', labelKey: 'nav.prompts', icon: <MessageIcon size={15} /> },
  { id: 'interaction', labelKey: 'nav.interaction', icon: <CommandIcon size={15} /> },
  { id: 'about', labelKey: 'nav.about', icon: <InfoIcon size={15} /> }
]

export function App(): React.JSX.Element {
  const config = useSettingsStore((s) => s.config)
  const [tab, setTab] = useState<TabId>('general')
  const [locale, setLocale] = useState<UiLocale>(() =>
    resolveLocale('system', typeof navigator !== 'undefined' ? navigator.language : 'zh-CN')
  )

  useEffect(() => {
    void useSettingsStore.getState().load()
    document.body.classList.toggle('is-mac', navigator.platform.toLowerCase().includes('mac'))
    const un = window.api.config.onChanged((cfg) => {
      useSettingsStore.setState({ config: cfg })
    })
    return un
  }, [])

  useEffect(() => {
    if (config) setLocale(resolveLocale(config.locale, navigator.language))
  }, [config])

  return (
    <LocaleProvider locale={locale}>
      <Shell tab={tab} setTab={setTab} />
    </LocaleProvider>
  )
}

function Shell({
  tab,
  setTab
}: {
  tab: TabId
  setTab: (t: TabId) => void
}): React.JSX.Element {
  const t = useT()
  const config = useSettingsStore((s) => s.config)

  if (!config) {
    return <div className="loading-screen" />
  }

  return (
    <div className="settings-root">
      <aside className="sidebar">
        <div className="sidebar__title">{t('settings.title')}</div>
        <nav className="sidebar__nav">
          {TABS.map((item) => (
            <button
              key={item.id}
              className={`sidebar__item${tab === item.id ? ' sidebar__item--active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              {item.icon}
              <span>{t(item.labelKey)}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar__foot">
          <LogoIcon size={12} />
          <span>AskThis</span>
        </div>
      </aside>
      <main className="content" key={tab}>
        {tab === 'general' ? <GeneralSection /> : null}
        {tab === 'providers' ? <ProvidersSection /> : null}
        {tab === 'prompts' ? <PromptsSection /> : null}
        {tab === 'interaction' ? <InteractionSection /> : null}
        {tab === 'about' ? <AboutSection /> : null}
      </main>
    </div>
  )
}
