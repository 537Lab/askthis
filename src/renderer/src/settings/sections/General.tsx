import { useRef, useState } from 'react'
import { useT, Row, Section, Switch, NumberField, Button, ConfirmButton } from '../../shared/ui'
import { DownloadIcon, UploadIcon } from '../../shared/icons'
import { useSettingsStore } from '../store'

const IMPORTABLE_KEYS = [
  'locale',
  'theme',
  'launchAtLogin',
  'shortcut',
  'selectionMode',
  'clipboardFallback',
  'hideOnBlur',
  'windowWidth',
  'maxWindowHeight',
  'providers',
  'activeProviderId',
  'activeModelId',
  'reasoningLevel',
  'temperature',
  'maxTokens',
  'showReasoning',
  'requestTimeoutSec',
  'prompts',
  'activePromptId',
  'historyEnabled',
  'historyLimit'
] as const

export function GeneralSection(): React.JSX.Element {
  const t = useT()
  const config = useSettingsStore((s) => s.config)!
  const patch = useSettingsStore((s) => s.patch)
  const [cleared, setCleared] = useState(false)
  const [importNote, setImportNote] = useState<{ ok: boolean; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const clearHistory = async (): Promise<void> => {
    await window.api.history.clear()
    setCleared(true)
    window.setTimeout(() => setCleared(false), 1600)
  }

  const exportConfig = (): void => {
    const clean = {
      ...config,
      providers: config.providers.map(({ hasKey: _h, keyHint: _k, ...rest }) => rest)
    } as Record<string, unknown>
    delete clean.security
    const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `askthis-config-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importConfig = async (file: File | undefined): Promise<void> => {
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('invalid')
      }
      const nextPatch: Record<string, unknown> = {}
      for (const k of IMPORTABLE_KEYS) {
        if (Object.hasOwn(parsed, k)) nextPatch[k] = parsed[k]
      }
      if (!Object.keys(nextPatch).length) throw new Error('empty')
      await patch(nextPatch)
      setImportNote({ ok: true, text: t('config.importSuccess') })
    } catch {
      setImportNote({ ok: false, text: t('config.importInvalid') })
    }
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
          <ConfirmButton
            label={cleared ? t('general.history.cleared') : t('common.delete')}
            confirmLabel={t('common.confirmDelete')}
            cancelLabel={t('common.cancel')}
            onConfirm={clearHistory}
          />
        </Row>
      </Section>

      <Section>
        <Row label={t('config.export')} desc={importNote ? importNote.text : undefined}>
          <div className="form-actions">
            <Button size="sm" onClick={exportConfig}>
              <DownloadIcon size={12} />
              <span>{t('config.export')}</span>
            </Button>
            <Button size="sm" onClick={() => fileInputRef.current?.click()}>
              <UploadIcon size={12} />
              <span>{t('config.import')}</span>
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                void importConfig(file)
              }}
            />
          </div>
        </Row>
      </Section>
    </>
  )
}
