import type { HistoryEntry } from '@shared/types'

/**
 * 将历史记录列表格式化为可读、可导入笔记软件的 Markdown 文档
 */
export function formatHistoryAsMarkdown(entries: HistoryEntry[]): string {
  const lines: string[] = [
    '# AskThis Query History',
    '',
    `Exported at: ${new Date().toISOString()}`,
    ''
  ]

  for (const entry of entries) {
    const dt = new Date(entry.ts).toISOString().replace('T', ' ').slice(0, 16)
    const meta = [dt, entry.model, entry.promptName].filter(Boolean).join(' · ')
    const title = entry.question.replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled'
    lines.push(`## ${title}`, '')
    if (meta) lines.push(`> ${meta}`, '')

    const turns =
      entry.turns && entry.turns.length > 0
        ? entry.turns
        : [{ q: entry.question, a: entry.answer }]

    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i]
      if (turns.length > 1) {
        lines.push(`### Turn ${i + 1}`, '')
      }
      if (turn.q) {
        lines.push('**Q:**', '', turn.q, '')
      }
      if (turn.a) {
        lines.push('**A:**', '', turn.a, '')
      }
    }
    lines.push('---', '')
  }

  return lines.join('\n')
}
