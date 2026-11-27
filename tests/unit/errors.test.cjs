const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { loadSource } = require('./load-source.cjs')

test('classifyAIError maps HTTP statuses and network failures cleanly', () => {
  const { classifyAIError } = loadSource('src/main/ai/errors.ts')
  assert.deepEqual(JSON.parse(JSON.stringify(classifyAIError(401, 'bad key', 'https://api.openai.com/v1'))), {
    code: 'AUTH_FAILED',
    retryable: false
  })
  assert.deepEqual(JSON.parse(JSON.stringify(classifyAIError(402, 'no credit', 'https://api.deepseek.com/v1'))), {
    code: 'INSUFFICIENT_QUOTA',
    retryable: false
  })
  assert.deepEqual(JSON.parse(JSON.stringify(classifyAIError(404, 'not found', 'https://api.openai.com/v1'))), {
    code: 'ENDPOINT_OR_MODEL_NOT_FOUND',
    retryable: false
  })
  assert.deepEqual(JSON.parse(JSON.stringify(classifyAIError(429, 'rate limit', 'https://api.openai.com/v1'))), {
    code: 'RATE_LIMITED',
    retryable: true
  })
  assert.deepEqual(JSON.parse(JSON.stringify(classifyAIError(503, 'bad gateway', 'https://api.openai.com/v1'))), {
    code: 'UPSTREAM_UNAVAILABLE',
    retryable: true
  })
  assert.deepEqual(JSON.parse(JSON.stringify(classifyAIError(undefined, 'connect ECONNREFUSED', 'http://127.0.0.1:11434/v1'))), {
    code: 'LOCAL_SERVER_OFFLINE',
    retryable: false
  })
  assert.deepEqual(JSON.parse(JSON.stringify(classifyAIError(undefined, 'fetch failed', 'https://api.openai.com/v1'))), {
    code: 'NETWORK_ERROR',
    retryable: true
  })
})

test('QuerySession retries transient 503 once when no delta received, never retries after partial stream', async (t) => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'askthis-err-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const { HistoryStore } = loadSource('src/main/services/history.ts')
  const history = new HistoryStore(dir)

  class FakeAIError extends Error {
    constructor(message, detail, status, code, retryable) {
      super(message)
      this.detail = detail
      this.status = status
      this.code = code
      this.retryable = retryable
    }
  }

  let attempts = 0
  const events1 = []
  const store = {
    get: () => ({
      providers: [{ id: 'p1', name: 'OA', kind: 'openai-compatible', baseUrl: 'https://api.example.com/v1', models: [{ id: 'm1' }], reasoningStyle: 'none' }],
      activeProviderId: 'p1',
      activeModelId: 'm1',
      prompts: [{ id: 'pr', name: 'PR', system: '', template: '{{text}}' }],
      activePromptId: 'pr',
      reasoningLevel: 'off',
      temperature: null,
      maxTokens: 128,
      requestTimeoutSec: 10,
      historyEnabled: false,
      historyLimit: 10
    }),
    getApiKey: () => 'sk-123'
  }

  const { QuerySession } = loadSource('src/main/services/session.ts', {
    '../ai/client': {
      AIError: FakeAIError,
      streamChat: async (opts) => {
        attempts++
        if (attempts === 1) {
          throw new FakeAIError('HTTP 503', 'upstream busy', 503, 'UPSTREAM_UNAVAILABLE', true)
        }
        opts.onDelta('text', 'recovered')
        return { usage: { totalTokens: 42 } }
      }
    },
    '../utils/fs': { sleep: async () => {} }
  })

  const s1 = new QuerySession({ store, history, emit: (e) => events1.push(e) }, { text: 'q', source: 'selection' })
  await s1.start()
  assert.equal(attempts, 2)
  assert.equal(events1.some((e) => e.type === 'done' && e.usage.totalTokens === 42), true)

  // 若已经输出部分 delta 后再遇到可重试错误，绝不重复发送以免拼接混乱
  let partialAttempts = 0
  const events2 = []
  const { QuerySession: QS2 } = loadSource('src/main/services/session.ts', {
    '../ai/client': {
      AIError: FakeAIError,
      streamChat: async (opts) => {
        partialAttempts++
        opts.onDelta('text', 'part')
        throw new FakeAIError('HTTP 502', 'dropped', 502, 'UPSTREAM_UNAVAILABLE', true)
      }
    },
    '../utils/fs': { sleep: async () => {} }
  })
  const s2 = new QS2({ store, history, emit: (e) => events2.push(e) }, { text: 'q2', source: 'selection' })
  await s2.start()
  assert.equal(partialAttempts, 1, 'must not retry after partial delta')
  assert.equal(events2.find((e) => e.type === 'error').message, 'UPSTREAM_UNAVAILABLE')
})
