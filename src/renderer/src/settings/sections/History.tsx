import { useEffect, useMemo, useState } from 'react'
import type { HistoryEntry, HistoryTurn } from '@shared/types'
import { useT, Section, Button, ConfirmButton } from '../../shared/ui'
import { SearchIcon, CopyIcon, CheckIcon, DownloadIcon } from '../../shared/icons'
import { Markdown } from '../../shared/markdown'
import { formatHistoryAsMarkdown } from '../../shared/history-export'
import { useSettingsStore } from '../store'

export function HistorySection(): React.JSX.Element {
  const t = useT()
  const config = useSettingsStore((s) => s.config)!
  const patch = useSettingsStore((s) => s.patch)
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string>('')
  const [copiedId, setCopiedId] = useState<string>('')
  const [exported, setExported] = useState(false)

  useEffect(() => {
    void window.api.history.list().then((list) => {
      setEntries(list)
      if (list.length > 0) setSelectedId((prev) => prev || list[0].id)
    })
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((item) => {
      if (item.question.toLowerCase().includes(q)) return true
      if (item.answer.toLowerCase().includes(q)) return true
      if (item.model.toLowerCase().includes(q)) return true
      if (item.promptName?.toLowerCase().includes(q)) return true
      return item.turns?.some(
        (turn) => turn.q.toLowerCase().includes(q) || turn.a.toLowerCase().includes(q)
      )
    })
  }, [entries, query])

  const selected = filtered.find((e) => e.id === selectedId) ?? filtered[0]

  const turnsOf = (entry: HistoryEntry): HistoryTurn[] => {
    if (entry.turns && entry.turns.length > 0) return entry.turns
    return [{ q: entry.question, a: entry.answer }]
  }

  const copyText = (id: string, text: string): void => {
    void navigator.clipboard?.writeText(text).catch(() => {})
    setCopiedId(id)
    window.setTimeout(() => {
      setCopiedId((cur) => (cur === id ? '' : cur))
    }, 1600)
  }

  const deleteOne = async (id: string): Promise<void> => {
    await window.api.history.delete(id)
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }

  const clearAll = async (): Promise<void> => {
    await window.api.history.clear()
    setEntries([])
    setSelectedId('')
  }

  const exportMarkdown = (): void => {
    if (!filtered.length) return
    const md = formatHistoryAsMarkdown(filtered)
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `askthis-history-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(url)
    setExported(true)
    window.setTimeout(() => setExported(false), 1600)
  }

  return (
    <>
      {!config.historyEnabled ? (
        <div className="banner">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span>{t('history.disabledNotice')}</span>
            <Button size="sm" variant="primary" onClick={() => void patch({ historyEnabled: true })}>
              {t('general.history.enabled')}
            </Button>
          </div>
        </div>
      ) : null}

      <Section title={t('nav.history')}>
        <div className="history-toolbar">
          <div className="history-search">
            <SearchIcon size={14} />
            <input
              className="history-search__input"
              value={query}
              placeholder={t('history.search')}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {query.trim() ? (
            <span className="at-hint">{filtered.length}/{entries.length}</span>
          ) : null}
          <Button size="sm" disabled={filtered.length === 0} onClick={exportMarkdown}>
            <DownloadIcon size={12} />
            <span>{exported ? t('history.exported') : t('history.exportMarkdown')}</span>
          </Button>
          <ConfirmButton
            label={t('general.history.clear')}
            confirmLabel={t('common.confirmDelete')}
            cancelLabel={t('common.cancel')}
            disabled={entries.length === 0}
            onConfirm={clearAll}
          />
        </div>

        {entries.length === 0 ? (
          <div className="history-empty">{t('history.empty')}</div>
        ) : filtered.length === 0 ? (
          <div className="history-empty">{t('history.noMatch')}</div>
        ) : (
          <div className="history-layout">
            <div className="history-list">
              {filtered.map((item) => {
                const count = item.turns?.length ?? 1
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`history-item${item.id === selected?.id ? ' history-item--active' : ''}`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <div className="history-item__q">{item.question}</div>
                    <div className="history-item__meta">
                      <span>{formatTime(item.ts)}</span>
                      {count > 1 ? <span>· {count}</span> : null}
                      {item.model ? <span className="history-item__model">{item.model}</span> : null}
                    </div>
                  </button>
                )
              })}
            </div>

            {selected ? (
              <div className="history-detail">
                <div className="history-detail__meta">
                  {[selected.promptName, selected.model].filter(Boolean).length ? (
                    <span className="at-hint">{[selected.promptName, selected.model].filter(Boolean).join(' · ')}</span>
                  ) : null}
                  <span className="at-hint" style={{ marginLeft: 'auto' }}>
                    {new Date(selected.ts).toLocaleString()}
                  </span>
                </div>

                <div className="history-detail__turns">
                  {turnsOf(selected).map((turn, idx) => (
                    <div key={`${selected.id}:${idx}`} className="history-turn">
                      <div className="history-turn__q">{turn.q}</div>
                      <Markdown
                        className="history-turn__a"
                        text={turn.a}
                        copyLabel={t('popup.copyCode')}
                        copiedLabel={t('popup.codeCopied')}
                        onCopyCode={(code) => {
                          void navigator.clipboard?.writeText(code).catch(() => {})
                        }}
                      />
                    </div>
                  ))}
                </div>

                <div className="history-detail__actions">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => void window.api.history.reopen(selected.id)}
                  >
                    {t('history.reopen')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      const fullText = turnsOf(selected)
                        .map((item) => item.a)
                        .join('\n\n---\n\n')
                      copyText(selected.id, fullText)
                    }}
                  >
                    {copiedId === selected.id ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
                    <span>{copiedId === selected.id ? t('popup.copied') : t('history.copyAnswer')}</span>
                  </Button>
                  <span style={{ flex: 1 }} />
                  <ConfirmButton
                    label={t('history.delete')}
                    confirmLabel={t('common.confirmDelete')}
                    cancelLabel={t('common.cancel')}
                    onConfirm={() => deleteOne(selected.id)}
                  />
                </div>
              </div>
            ) : null}
          </div>
        )}
      </Section>
    </>
  )
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}
