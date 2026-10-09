import { useState } from 'react'
import { BUILTIN_PROMPTS } from '@shared/defaults'
import type { PromptPreset } from '@shared/types'
import { useT, Section, Button, Field } from '../../shared/ui'
import { useSettingsStore } from '../store'

export function PromptsSection(): React.JSX.Element {
  const t = useT()
  const config = useSettingsStore((s) => s.config)!
  const patch = useSettingsStore((s) => s.patch)
  const [editingId, setEditingId] = useState<string>(config.activePromptId)

  const editing = config.prompts.find((p) => p.id === editingId) ?? config.prompts[0]
  if (!editing) return <></>

  const update = (partial: Partial<PromptPreset>): void => {
    void patch({ prompts: config.prompts.map((p) => (p.id === editing.id ? { ...p, ...partial } : p)) })
  }

  const builtinVersion = BUILTIN_PROMPTS.find((b) => b.id === editing.id)
  const modified =
    !!builtinVersion &&
    (editing.system !== builtinVersion.system ||
      editing.template !== builtinVersion.template ||
      editing.name !== builtinVersion.name)
  const isActive = config.activePromptId === editing.id

  const setActive = (): void => {
    void patch({ activePromptId: editing.id })
  }

  const duplicate = async (): Promise<void> => {
    const np: PromptPreset = {
      ...editing,
      id: `p-${Math.random().toString(36).slice(2, 8)}`,
      name: `${editing.name} (copy)`,
      builtin: false
    }
    await patch({ prompts: [...config.prompts, np] })
    setEditingId(np.id)
  }

  const remove = async (): Promise<void> => {
    if (!window.confirm(t('prompts.delete.confirm', { name: editing.name }))) return
    const next = config.prompts.filter((p) => p.id !== editing.id)
    const nextActive = isActive ? (next[0]?.id ?? '') : config.activePromptId
    await patch({ prompts: next, activePromptId: nextActive })
    setEditingId(next[0]?.id ?? '')
  }

  const restore = (): void => {
    if (!builtinVersion) return
    void patch({
      prompts: config.prompts.map((p) =>
        p.id === editing.id
          ? { ...p, name: builtinVersion.name, system: builtinVersion.system, template: builtinVersion.template }
          : p
      )
    })
  }

  const addNew = async (): Promise<void> => {
    const np: PromptPreset = {
      id: `p-${Math.random().toString(36).slice(2, 8)}`,
      name: t('prompts.newName'),
      system: '',
      template: '{{text}}'
    }
    await patch({ prompts: [...config.prompts, np] })
    setEditingId(np.id)
  }

  return (
    <Section title={t('nav.prompts')}>
      <div className="prompt-layout" style={{ padding: 14 }}>
        <div className="prompt-list">
          {config.prompts.map((p) => (
            <button
              key={p.id}
              className={`prompt-list__item${p.id === editing.id ? ' prompt-list__item--active' : ''}`}
              onClick={() => setEditingId(p.id)}
            >
              {p.id === config.activePromptId ? <span className="prompt-list__active-dot" /> : null}
              <span className="prompt-list__name">{p.name}</span>
              {p.builtin ? <span className="prompt-list__builtin">{t('prompts.builtin')}</span> : null}
            </button>
          ))}
          <button className="prov-list__add" onClick={() => void addNew()}>
            + {t('prompts.add')}
          </button>
        </div>

        <div className="prov-detail">
          <div className="form-grid">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label className="form-field__label" style={{ margin: 0 }}>
                  {t('prompts.nameField')}
                </label>
                {isActive ? <span className="at-badge at-badge--accent">{t('prompts.inUse')}</span> : null}
              </div>
              <Field value={editing.name} onCommit={(v) => update({ name: v.trim() || editing.name })} />
            </div>

            <hr className="form-sep" />

            <div>
              <label className="form-field__label">{t('prompts.system')}</label>
              <Field
                multiline
                mono
                rows={9}
                value={editing.system}
                placeholder={t('prompts.system')}
                onCommit={(v) => update({ system: v })}
              />
            </div>

            <div>
              <label className="form-field__label">{t('prompts.template')}</label>
              <Field
                multiline
                mono
                rows={3}
                value={editing.template}
                onCommit={(v) => update({ template: v })}
              />
              <div className="form-hint">{t('prompts.template.desc')}</div>
            </div>

            <hr className="form-sep" />

            <div className="form-actions">
              {isActive ? null : (
                <Button size="sm" variant="primary" onClick={setActive}>
                  {t('prompts.setActive')}
                </Button>
              )}
              <Button size="sm" onClick={() => void duplicate()}>
                {t('prompts.duplicate')}
              </Button>
              {modified ? (
                <Button size="sm" onClick={restore}>
                  {t('prompts.reset')}
                </Button>
              ) : null}
              <span style={{ flex: 1 }} />
              <Button size="sm" variant="danger" onClick={() => void remove()}>
                {t('prompts.delete')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Section>
  )
}
