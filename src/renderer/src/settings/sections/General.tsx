import { useState } from 'react'
import { useT, Row, Section, Switch, NumberField, Button } from '../../shared/ui'
import { useSettingsStore } from '../store'

export function GeneralSection(): React.JSX.Element {
  const t = useT()
  const config = useSettingsStore((s) => s.config)!
  const patch = useSettingsStore((s) => s.patch)
  const [cleared, setCleared] = useState(false)

  const clearHistory = async (): Promise<void> => {
    await window.api.history.clear()
    setCleared(true)
    window.setTimeout(() => setCleared(false), 1600)
  }

  return (
    <>
      <Section title={t('nav.general')}>
        <Row label={t('general.launchAtLogin')} desc={t('general.launchAtLogin.desc')}>
          <Switch checked={config.launchAtLogin} onChange={(v) => void patch({ launchAtLogin: v })} />
        </Row>
        <Row label={t('general.language')}>
          <select
            className="at-select"
            style={{ width: 176 }}
            value={config.locale}
            onChange={(e) => void patch({ locale: e.target.value })}
          >
            <option value="system">{t('general.language.system')}</option>
            <option value="zh-CN">简体中文</option>
            <option value="en-US">English</option>
          </select>
        </Row>
        <Row label={t('general.theme')}>
          <select
            className="at-select"
            style={{ width: 176 }}
            value={config.theme}
            onChange={(e) => void patch({ theme: e.target.value })}
          >
            <option value="system">{t('general.theme.system')}</option>
            <option value="light">{t('general.theme.light')}</option>
            <option value="dark">{t('general.theme.dark')}</option>
          </select>
        </Row>
      </Section>

      <Section title={t('general.selectionMode')}>
        <Row label={t('general.selectionMode')} desc={t('general.selectionMode.desc')}>
          <select
            className="at-select"
            style={{ width: 176 }}
            value={config.selectionMode}
            onChange={(e) => void patch({ selectionMode: e.target.value })}
          >
            <option value="auto">{t('general.selectionMode.auto')}</option>
            <option value="clipboard">{t('general.selectionMode.clipboard')}</option>
            <option value="manual">{t('general.selectionMode.manual')}</option>
          </select>
        </Row>
        {config.selectionMode === 'auto' ? (
          <Row label={t('general.clipboardFallback')} desc={t('general.clipboardFallback.desc')}>
            <Switch
              checked={config.clipboardFallback}
              onChange={(v) => void patch({ clipboardFallback: v })}
            />
          </Row>
        ) : null}
        <Row label={t('general.hideOnBlur')} desc={t('general.hideOnBlur.desc')}>
          <Switch checked={config.hideOnBlur} onChange={(v) => void patch({ hideOnBlur: v })} />
        </Row>
        <Row label={t('general.windowWidth')}>
          <NumberField
            value={config.windowWidth}
            min={320}
            max={720}
            suffix={t('general.pixels')}
            onCommit={(v) => void patch({ windowWidth: v })}
          />
        </Row>
        <Row label={t('general.maxWindowHeight')}>
          <NumberField
            value={config.maxWindowHeight}
            min={200}
            max={900}
            suffix={t('general.pixels')}
            onCommit={(v) => void patch({ maxWindowHeight: v })}
          />
        </Row>
      </Section>

      <Section title={t('general.history')}>
        <Row label={t('general.history.enabled')} desc={t('general.history.desc')}>
          <Switch checked={config.historyEnabled} onChange={(v) => void patch({ historyEnabled: v })} />
        </Row>
        <Row label={t('general.history.limit')}>
          <NumberField
            value={config.historyLimit}
            min={0}
            max={500}
            onCommit={(v) => void patch({ historyLimit: v })}
          />
        </Row>
        <Row label={t('general.history.clear')}>
          <Button size="sm" onClick={() => void clearHistory()}>
            {cleared ? t('general.history.cleared') : t('common.delete')}
          </Button>
        </Row>
      </Section>
    </>
  )
}
