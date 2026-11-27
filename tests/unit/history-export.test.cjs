const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadSource } = require('./load-source.cjs')

test('formatHistoryAsMarkdown renders single and multi-turn entries cleanly', () => {
  const { formatHistoryAsMarkdown } = loadSource('src/renderer/src/shared/history-export.ts')
  const md = formatHistoryAsMarkdown([
    {
      id: '1',
      ts: Date.UTC(2026, 10, 28, 3, 0),
      source: 'selection',
      question: 'Idempotence',
      answer: 'Same result every time.',
      model: 'gpt-6-sol',
      promptName: '速查',
      turns: [
        { q: 'Idempotence', a: 'Same result every time.' },
        { q: 'Example?', a: 'Setting a switch to OFF.' }
      ]
    },
    {
      id: '2',
      ts: Date.UTC(2026, 10, 28, 2, 0),
      source: 'manual',
      question: 'Fallback entry',
      answer: 'Legacy answer.',
      model: 'deepseek-flash'
    }
  ])

  assert.ok(md.includes('# AskThis Query History'))
  assert.ok(md.includes('## Idempotence'))
  assert.ok(md.includes('### Turn 1'))
  assert.ok(md.includes('### Turn 2'))
  assert.ok(md.includes('Setting a switch to OFF.'))
  assert.ok(md.includes('## Fallback entry'))
  assert.ok(md.includes('Legacy answer.'))
})
