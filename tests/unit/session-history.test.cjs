const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { loadSource } = require('./load-source.cjs')

function makeTempDir(t) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'askthis-sess-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('HistoryStore tolerates malformed json and supports upsertBySession & remove', (t) => {
  const dir = makeTempDir(t)
  const file = path.join(dir, 'history.json')
  fs.writeFileSync(file, JSON.stringify({ broken: true }))
  const { HistoryStore } = loadSource('src/main/services/history.ts')

  const badStore = new HistoryStore(dir)
  assert.deepEqual(JSON.parse(JSON.stringify(badStore.list())), [])

  fs.writeFileSync(file, JSON.stringify([{ bad: 1 }, { id: 'h1', ts: 100, source: 'manual', question: 'q', answer: 'a', model: 'm' }]))
  const store = new HistoryStore(dir)
  assert.equal(store.list().length, 1)

  store.upsertBySession({ id: 's1', sessionId: 's1', ts: 200, source: 'selection', question: 'Q1', answer: 'A1', model: 'm1' }, 10)
  store.upsertBySession({ id: 's1', sessionId: 's1', ts: 300, source: 'selection', question: 'Q1', answer: 'A2', model: 'm1', turns: [{ q: 'Q1', a: 'A1' }, { q: 'Q2', a: 'A2' }] }, 10)
  assert.equal(store.list().length, 2, 'same sessionId must update instead of duplicating')
  assert.equal(store.list()[0].answer, 'A2')
  assert.equal(store.list()[0].turns.length, 2)

  assert.equal(store.remove('h1'), true)
  assert.equal(store.remove('non-existent'), false)
  assert.equal(new HistoryStore(dir).list().length, 1)
})

test('QuerySession emits NO_MODEL when activeModelId is empty', async (t) => {
  const dir = makeTempDir(t)
  const { HistoryStore } = loadSource('src/main/services/history.ts')
  const history = new HistoryStore(dir)
  const events = []
  const store = {
    get: () => ({
      providers: [{ id: 'p1', name: 'Local', kind: 'openai-compatible', baseUrl: 'http://127.0.0.1:11434/v1', models: [], reasoningStyle: 'none' }],
      activeProviderId: 'p1',
      activeModelId: '',
      prompts: [{ id: 'lookup', name: 'Lookup', system: 'sys', template: '{{text}}' }],
      activePromptId: 'lookup',
      reasoningLevel: 'off',
      temperature: null,
      maxTokens: 256,
      requestTimeoutSec: 10,
      historyEnabled: true,
      historyLimit: 20
    }),
    getApiKey: () => undefined
  }
  const { QuerySession } = loadSource('src/main/services/session.ts', {
    '../ai/client': { AIError: class extends Error {}, streamChat: async () => ({}) }
  })
  const sess = new QuerySession({ store, history, emit: (e) => events.push(e) }, { text: 'hello', source: 'selection' })
  await sess.start()
  assert.equal(events.length, 1)
  assert.equal(events[0].type, 'error')
  assert.equal(events[0].message, 'NO_MODEL')
})

test('QuerySession passes incomplete flag cleanly, aggregates turns, and requeries with updated prompt', async (t) => {
  const dir = makeTempDir(t)
  const { HistoryStore } = loadSource('src/main/services/history.ts')
  const history = new HistoryStore(dir)
  const events = []
  const streamRequests = []
  let activePromptId = 'p1'
  let streamCall = 0

  const store = {
    get: () => ({
      providers: [{ id: 'local', name: 'Local', kind: 'openai-compatible', baseUrl: 'http://127.0.0.1:8080/v1', models: [{ id: 'm1' }], reasoningStyle: 'none' }],
      activeProviderId: 'local',
      activeModelId: 'm1',
      prompts: [
        { id: 'p1', name: 'Prompt 1', system: 'SYS1', template: 'T1:{{text}}' },
        { id: 'p2', name: 'Prompt 2', system: 'SYS2', template: 'T2:{{text}}' }
      ],
      activePromptId,
      reasoningLevel: 'off',
      temperature: null,
      maxTokens: 256,
      requestTimeoutSec: 10,
      historyEnabled: true,
      historyLimit: 20
    }),
    getApiKey: () => undefined
  }

  const { QuerySession } = loadSource('src/main/services/session.ts', {
    '../ai/client': {
      AIError: class extends Error {},
      streamChat: async (opts) => {
        streamRequests.push(opts.messages)
        streamCall++
        opts.onDelta('text', `ans-${streamCall}`)
        return { incomplete: streamCall === 1 }
      }
    }
  })

  const sess = new QuerySession({ store, history, emit: (e) => events.push(e) }, { text: 'word', source: 'selection' })
  await sess.start()

  const done1 = events.find((e) => e.type === 'done')
  assert.equal(done1.incomplete, true)
  const deltas1 = events.filter((e) => e.type === 'delta').map((e) => e.delta).join('')
  assert.equal(deltas1, 'ans-1', 'incomplete notice must not be hardcoded into answer text')

  // 切换提示词并重查首轮：应重新套用 p2 模板与 SYS2
  activePromptId = 'p2'
  await sess.requeryWithCurrentConfig()
  assert.deepEqual(JSON.parse(JSON.stringify(streamRequests[1])), [
    { role: 'system', content: 'SYS2' },
    { role: 'user', content: 'T2:word' }
  ])
  assert.equal(history.list().length, 1)
  assert.equal(history.list()[0].answer, 'ans-2')
  assert.equal(history.list()[0].promptId, 'p2')

  // 追问应合并进同一条历史记录的 turns 中
  await sess.submit('why?')
  assert.equal(history.list().length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(history.list()[0].turns)), [
    { q: 'word', a: 'ans-2' },
    { q: 'why?', a: 'ans-3' }
  ])
})

test('QuerySession.fromHistory restores multi-turn context for follow-ups without duplicating history', async (t) => {
  const dir = makeTempDir(t)
  const { HistoryStore } = loadSource('src/main/services/history.ts')
  const history = new HistoryStore(dir)
  const sentMessages = []
  const store = {
    get: () => ({
      providers: [{ id: 'local', name: 'Local', kind: 'openai-compatible', baseUrl: 'http://127.0.0.1:8080/v1', models: [{ id: 'm1' }], reasoningStyle: 'none' }],
      activeProviderId: 'local',
      activeModelId: 'm1',
      prompts: [{ id: 'p1', name: 'P1', system: 'SYS', template: '{{text}}' }],
      activePromptId: 'p1',
      reasoningLevel: 'off',
      temperature: null,
      maxTokens: 256,
      requestTimeoutSec: 10,
      historyEnabled: true,
      historyLimit: 20
    }),
    getApiKey: () => undefined
  }
  const { QuerySession } = loadSource('src/main/services/session.ts', {
    '../ai/client': {
      AIError: class extends Error {},
      streamChat: async (opts) => {
        sentMessages.push(opts.messages)
        opts.onDelta('text', 'next answer')
        return {}
      }
    }
  })

  const entry = {
    id: 'hist-1',
    sessionId: 'sess-1',
    ts: 1000,
    source: 'selection',
    question: 'Q1',
    answer: 'A1',
    model: 'm1',
    turns: [{ q: 'Q1', a: 'A1' }]
  }
  history.upsertBySession(entry, 20)
  const sess = QuerySession.fromHistory({ store, history, emit: () => {} }, entry)
  await sess.submit('Q2')
  assert.deepEqual(JSON.parse(JSON.stringify(sentMessages[0])), [
    { role: 'system', content: 'SYS' },
    { role: 'user', content: 'Q1' },
    { role: 'assistant', content: 'A1' },
    { role: 'user', content: 'Q2' }
  ])
  assert.equal(history.list().length, 1)
  assert.equal(history.list()[0].turns.length, 2)
})
