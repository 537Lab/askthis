import { useMemo, useState } from 'react'
import type { ModelInfo, ProviderConfig, ProviderPreset, PublicProvider, ReasoningStyle } from '@shared/types'
import { PROVIDER_PRESETS, providerFromPreset } from '@shared/presets'
import { useT, Section, Row, Button, Field, NumberField, Switch, IconButton, Spinner } from '../../shared/ui'
import { TrashIcon, RefreshIcon, ExternalIcon, CheckIcon } from '../../shared/icons'
import { useSettingsStore } from '../store'

/* ============================== main section ============================== */

export function ProvidersSection(): React.JSX.Element {
  const t = useT()
  const config = useSettingsStore((s) => s.config)!
  const patch = useSettingsStore((s) => s.patch)
  const [editingId, setEditingId] = useState<string>(
    config.activeProviderId || config.providers[0]?.id || ''
  )
  const [adding, setAdding] = useState(false)

  const editing = config.providers.find((p) => p.id === editingId) ?? config.providers[0]
  const activeProvider = config.providers.find((p) => p.id === config.activeProviderId)
  const hasAnyKey = config.providers.some((p) => p.hasKey)

  return (
    <>
      {!config.security.encryptionAvailable ? (
        <div className="banner" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'space-between' }}>
            <span>{t('providers.security.noEncryption')}</span>
            <Switch
              checked={config.security.plaintextAllowed}
              onChange={(v) => void patch({ allowPlaintextSecrets: v })}
            />
          </div>
        </div>
      ) : null}
      {!hasAnyKey && config.providers.length > 0 ? (
        <div className="banner">{t('providers.welcome')}</div>
      ) : null}

      <Section title={t('providers.section.active')}>
        <Row label={t('providers.section.active')} desc={t('providers.section.active.desc')} stack>
          <div style={{ display: 'flex', gap: 10, width: '100%' }}>
            <select
              className="at-select"
              style={{ flex: 1 }}
              value={config.activeProviderId}
              onChange={(e) => {
                const pid = e.target.value
                const p = config.providers.find((x) => x.id === pid)
                void patch({ activeProviderId: pid, activeModelId: p?.models[0]?.id ?? '' })
              }}
            >
              {config.providers.length === 0 ? (
                <option value="">{t('providers.empty.message')}</option>
              ) : (
                config.providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))
              )}
            </select>
            <select
              className="at-select"
              style={{ flex: 1 }}
              value={config.activeModelId}
              disabled={!activeProvider?.models.length}
              onChange={(e) => void patch({ activeModelId: e.target.value })}
            >
              {activeProvider?.models.length ? (
                activeProvider.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))
              ) : (
                <option value="">—</option>
              )}
            </select>
          </div>
        </Row>
        <Row label={t('models.reasoningLevel')} desc={t('models.reasoningLevel.desc')}>
          <select
            className="at-select"
            style={{ width: 140 }}
            value={config.reasoningLevel}
            onChange={(e) => void patch({ reasoningLevel: e.target.value })}
          >
            {(['off', 'low', 'medium', 'high', 'max'] as const).map((lv) => (
              <option key={lv} value={lv}>
                {t(`level.${lv}`)}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t('models.showReasoning')} desc={t('models.showReasoning.desc')}>
          <Switch checked={config.showReasoning} onChange={(v) => void patch({ showReasoning: v })} />
        </Row>
        <Row label={t('models.maxTokens')} desc={t('models.maxTokens.desc')}>
          <NumberField
            value={config.maxTokens}
            min={64}
            max={32768}
            onCommit={(v) => void patch({ maxTokens: v })}
          />
        </Row>
        <Row label={t('models.temperature')} desc={t('models.temperature.desc')}>
          <Field
            width={110}
            placeholder="—"
            value={config.temperature == null ? '' : String(config.temperature)}
            onCommit={(v) => {
              const s = v.trim()
              if (!s) {
                void patch({ temperature: null })
                return
              }
              const n = Number.parseFloat(s)
              if (Number.isFinite(n) && n >= 0 && n <= 2) void patch({ temperature: n })
            }}
          />
        </Row>
        <Row label={t('models.timeout')} desc={t('models.timeout.desc')}>
          <NumberField
            value={config.requestTimeoutSec}
            min={5}
            max={600}
            suffix={t('models.timeout.desc')}
            onCommit={(v) => void patch({ requestTimeoutSec: v })}
          />
        </Row>
      </Section>

      <Section title={t('providers.section.services')}>
        <div className="prov-layout" style={{ padding: 14 }}>
          <div className="prov-list">
            {config.providers.map((p) => (
              <button
                key={p.id}
                className={`prov-list__item${p.id === editing?.id ? ' prov-list__item--active' : ''}`}
                onClick={() => setEditingId(p.id)}
              >
                <span className={`dot${p.hasKey ? ' dot--ok' : ''}`} />
                <span className="prov-list__name">{p.name}</span>
                {p.id === config.activeProviderId ? <CheckIcon size={13} /> : null}
              </button>
            ))}
            <button className="prov-list__add" onClick={() => setAdding(true)}>
              + {t('providers.add')}
            </button>
          </div>
          <div className="prov-detail">
            {editing ? (
              <ProviderForm key={editing.id} provider={editing} />
            ) : (
              <div className="at-hint" style={{ padding: 12 }}>
                {t('providers.empty.message')}
              </div>
            )}
          </div>
        </div>
      </Section>

      {adding ? (
        <AddProviderModal
          onClose={() => setAdding(false)}
          onAdded={(id) => {
            setEditingId(id)
            setAdding(false)
          }}
        />
      ) : null}
    </>
  )
}

/* ============================== provider detail form ============================== */

function ProviderForm({ provider }: { provider: PublicProvider }): React.JSX.Element {
  const t = useT()
  const config = useSettingsStore((s) => s.config)!
  const patch = useSettingsStore((s) => s.patch)
  const [keyInput, setKeyInput] = useState('')
  const [testBusy, setTestBusy] = useState(false)
  const [testNote, setTestNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [modelsBusy, setModelsBusy] = useState(false)
  const [modelsNote, setModelsNote] = useState<{ ok: boolean; text: string } | null>(null)

  const update = (partial: Partial<ProviderConfig>): void => {
    void patch({
      providers: config.providers.map((p) => (p.id === provider.id ? { ...p, ...partial } : p))
    })
  }

  const saveKey = async (): Promise<void> => {
    const k = keyInput.trim()
    if (!k) return
    await patch({ secrets: { [provider.id]: k } as unknown as Record<string, unknown> })
    setKeyInput('')
  }

  const clearKey = async (): Promise<void> => {
    await patch({ secrets: { [provider.id]: null } as unknown as Record<string, unknown> })
  }

  const test = async (): Promise<void> => {
    setTestBusy(true)
    setTestNote(null)
    const res = await window.api.config.testProvider(provider.id, provider.models[0]?.id)
    setTestBusy(false)
    setTestNote(
      res.ok
        ? res.sample
          ? { ok: true, text: t('providers.test.okSample', { ms: res.latencyMs ?? 0, sample: res.sample }) }
          : { ok: true, text: t('providers.test.ok', { ms: res.latencyMs ?? 0 }) }
        : { ok: false, text: t('providers.test.fail', { msg: res.message }) }
    )
  }

  const fetchModels = async (): Promise<void> => {
    setModelsBusy(true)
    setModelsNote(null)
    const res = await window.api.config.fetchModels(provider.id)
    setModelsBusy(false)
    if (!res.ok) {
      setModelsNote({ ok: false, text: t('providers.fetchModels.fail', { msg: res.message ?? '' }) })
      return
    }
    const existing = new Set(provider.models.map((m) => m.id))
    const added = res.models.filter((m) => !existing.has(m.id))
    update({ models: [...provider.models, ...added] })
    setModelsNote({ ok: true, text: t('providers.fetchModels.ok', { n: res.models.length }) })
  }

  const removeProvider = async (): Promise<void> => {
    if (!window.confirm(t('providers.delete.confirm', { name: provider.name }))) return
    await patch({
      providers: config.providers.filter((p) => p.id !== provider.id),
      secrets: { [provider.id]: null } as unknown as Record<string, unknown>
    })
  }

  const preset = PROVIDER_PRESETS.find((pr) => provider.id.startsWith(`p-${pr.id}-`))
  const headersText = useMemo(
    () =>
      Object.entries(provider.customHeaders ?? {})
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n'),
    [provider.customHeaders]
  )

  return (
    <div className="form-grid">
      <div>
        <label className="form-field__label">{t('providers.name')}</label>
        <Field value={provider.name} onCommit={(v) => update({ name: v.trim() || provider.name })} />
      </div>

      <div>
        <label className="form-field__label">{t('providers.baseUrl')}</label>
        <Field value={provider.baseUrl} onCommit={(v) => update({ baseUrl: v.trim() })} />
        <div className="form-hint">{t('providers.baseUrl.desc')}</div>
      </div>

      <div>
        <label className="form-field__label">{t('providers.apiKey')}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="at-input"
            type="password"
            value={keyInput}
            placeholder={
              provider.hasKey
                ? t('providers.apiKey.saved', { hint: provider.keyHint })
                : t('providers.apiKey.placeholder')
            }
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveKey()
            }}
          />
          <Button size="sm" variant="primary" disabled={!keyInput.trim()} onClick={() => void saveKey()}>
            {t('common.save')}
          </Button>
          {provider.hasKey ? (
            <Button size="sm" onClick={() => void clearKey()}>
              {t('common.delete')}
            </Button>
          ) : null}
        </div>
        {provider.hasKey ? <div className="form-hint">{t('providers.apiKey.keep')}</div> : null}
      </div>

      <div className="form-actions">
        <Button size="sm" onClick={() => void test()} disabled={testBusy}>
          {testBusy ? <Spinner size={11} /> : null}
          {t('providers.test')}
        </Button>
        {testNote ? (
          <span className={`at-hint ${testNote.ok ? 'at-hint--ok' : 'at-hint--err'}`}>
            {testNote.text}
          </span>
        ) : null}
      </div>

      <hr className="form-sep" />

      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6
          }}
        >
          <label className="form-field__label" style={{ margin: 0 }}>
            {t('providers.models')}
          </label>
          <Button size="sm" onClick={() => void fetchModels()} disabled={modelsBusy}>
            {modelsBusy ? <Spinner size={11} /> : <RefreshIcon size={11} />}
            {t('providers.fetchModels')}
          </Button>
        </div>
        <ModelsEditor provider={provider} onChange={(models) => update({ models })} />
        {modelsNote ? (
          <div className={`form-hint ${modelsNote.ok ? 'at-hint--ok' : 'at-hint--err'}`}>
            {modelsNote.text}
          </div>
        ) : null}
      </div>

      <div>
        <label className="form-field__label">{t('providers.reasoningStyle')}</label>
        <select
          className="at-select"
          value={provider.reasoningStyle}
          onChange={(e) => update({ reasoningStyle: e.target.value as ReasoningStyle })}
        >
          <option value="auto">{t('providers.reasoningStyle.auto')}</option>
          <option value="effort">{t('providers.reasoningStyle.effort')}</option>
          <option value="deepseek">{t('providers.reasoningStyle.deepseek')}</option>
          <option value="anthropic">{t('providers.reasoningStyle.anthropic')}</option>
          <option value="openrouter">{t('providers.reasoningStyle.openrouter')}</option>
          <option value="none">{t('providers.reasoningStyle.none')}</option>
        </select>
        <div className="form-hint">{t('providers.reasoningStyle.desc')}</div>
      </div>

      <div>
        <label className="form-field__label">{t('providers.headers')}</label>
        <Field
          multiline
          mono
          rows={3}
          value={headersText}
          placeholder={'X-Custom-Header: value'}
          onCommit={(v) => update({ customHeaders: parseHeaders(v) })}
        />
        <div className="form-hint">{t('providers.headers.desc')}</div>
      </div>

      <hr className="form-sep" />

      <div className="form-actions">
        {preset?.docsUrl ? (
          <Button size="sm" onClick={() => window.api.app.openExternal(preset.docsUrl!)}>
            <ExternalIcon size={11} /> {t('providers.docs')}
          </Button>
        ) : null}
        <span style={{ flex: 1 }} />
        <Button size="sm" variant="danger" onClick={() => void removeProvider()}>
          {t('providers.delete')}
        </Button>
      </div>
    </div>
  )
}

/* ============================== models editor ============================== */

function ModelsEditor({
  provider,
  onChange
}: {
  provider: PublicProvider
  onChange: (models: ModelInfo[]) => void
}): React.JSX.Element {
  const t = useT()
  const [draft, setDraft] = useState('')

  const add = (): void => {
    const id = draft.trim()
    if (!id) return
    if (provider.models.some((m) => m.id === id)) {
      setDraft('')
      return
    }
    onChange([...provider.models, { id }])
    setDraft('')
  }

  return (
    <div>
      <div className="prov-models">
        {provider.models.length === 0 ? (
          <div className="prov-models__empty">{t('providers.models.empty')}</div>
        ) : (
          provider.models.map((m) => (
            <div key={m.id} className="prov-models__row">
              <span className="prov-models__id">{m.id}</span>
              <label className="prov-models__check" title={t('providers.models.reasoningHint')}>
                <input
                  type="checkbox"
                  checked={m.reasoning !== false}
                  onChange={(e) =>
                    onChange(
                      provider.models.map((x) =>
                        x.id === m.id ? { ...x, reasoning: e.target.checked } : x
                      )
                    )
                  }
                />
                {t('providers.models.reasoning')}
              </label>
              <IconButton
                title={t('common.delete')}
                onClick={() => onChange(provider.models.filter((x) => x.id !== m.id))}
              >
                <TrashIcon size={12} />
              </IconButton>
            </div>
          ))
        )}
      </div>
      <div className="form-actions" style={{ marginTop: 8 }}>
        <input
          className="at-input"
          style={{ flex: 1 }}
          value={draft}
          placeholder={t('providers.models.placeholder')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <Button size="sm" onClick={add} disabled={!draft.trim()}>
          {t('providers.models.add')}
        </Button>
      </div>
    </div>
  )
}

/* ============================== add provider modal ============================== */

function AddProviderModal({
  onClose,
  onAdded
}: {
  onClose: () => void
  onAdded: (id: string) => void
}): React.JSX.Element {
  const t = useT()
  const config = useSettingsStore((s) => s.config)!
  const patch = useSettingsStore((s) => s.patch)

  const add = async (preset: ProviderPreset): Promise<void> => {
    const provider = providerFromPreset(preset)
    await patch({ providers: [...config.providers, provider] })
    onAdded(provider.id)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__title">{t('providers.addPreset')}</div>
        <div className="modal__list">
          {PROVIDER_PRESETS.map((preset) => (
            <button key={preset.id} className="modal__item" onClick={() => void add(preset)}>
              <span>{preset.name}</span>
              <span className="modal__item-hint">
                {preset.requiresKey ? 'API key' : preset.baseUrl.includes('localhost') ? 'local' : ''}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ============================== helpers ============================== */

function parseHeaders(text: string): Record<string, string> | undefined {
  const headers: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const idx = line.indexOf(':')
    if (idx > 0) {
      const k = line.slice(0, idx).trim()
      const v = line.slice(idx + 1).trim()
      if (k) headers[k] = v
    }
  }
  return Object.keys(headers).length ? headers : undefined
}
