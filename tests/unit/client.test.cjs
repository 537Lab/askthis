const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadSource } = require('./load-source.cjs')

function sseResponse(chunks, { ok = true, status = 200, streamErrorAfterFirst = null } = {}) {
  const enc = new TextEncoder()
  let idx = 0
  return {
    ok,
    status,
    body: {
      getReader() {
        return {
          async read() {
            if (idx === 1 && streamErrorAfterFirst) throw streamErrorAfterFirst
            if (idx >= chunks.length) return { done: true, value: undefined }
            const chunk = chunks[idx++]
            const value = typeof chunk === 'string' ? enc.encode(chunk) : chunk
            return { done: false, value }
          },
          async cancel() {},
          releaseLock() {}
        }
      }
    },
    async text() {
      return ''
    }
  }
}

function jsonResponse(data, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return data
    },
    async text() {
      return JSON.stringify(data)
    }
  }
}

function clientHarness(fetchImpl) {
  const calls = []
  const mod = loadSource('src/main/ai/client.ts', {
    electron: {
      net: {
        fetch: async (url, init) => {
          calls.push({ url, init })
          return fetchImpl(url, init)
        }
      }
    }
  })
  return { ...mod, calls }
}

const openaiProvider = {
  id: 'p-oa',
  name: 'OpenAI',
  kind: 'openai-compatible',
  baseUrl: 'https://api.example.com/v1',
  reasoningStyle: 'effort',
  models: [{ id: 'm1', reasoning: true }],
  customHeaders: {
    'X-Safe': 'ok',
    'Content-Type': 'text/plain',
    'X-Inject\r\nEvil': '1',
    'X-Evil-Val': 'abc\ndef'
  }
}

const anthropicProvider = {
  id: 'p-an',
  name: 'Anthropic',
  kind: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  reasoningStyle: 'anthropic',
  models: [{ id: 'claude-test', reasoning: true }]
}

test('OpenAI streaming parses UTF-8 split chunks, reasoning_text, and incomplete streams', async () => {
  const enc = new TextEncoder()
  const full = 'data: {"choices":[{"delta":{"reasoning_text":"想"}}]}\n\ndata: {"choices":[{"delta":{"content":"你好"}}]}\n\n'
  const bytes = enc.encode(full)
  const split = bytes.indexOf(0xe4) + 1 // 在多字节 UTF-8 字符中间切分
  const part1 = bytes.slice(0, split)
  const part2 = bytes.slice(split)

  const h = clientHarness(() => sseResponse([part1, part2]))
  const deltas = []
  const res = await h.streamChat({
    provider: openaiProvider,
    apiKey: 'sk-test',
    model: 'm1',
    messages: [{ role: 'user', content: 'hi' }],
    reasoningLevel: 'low',
    temperature: 0.7,
    maxTokens: 128,
    timeoutSec: 10,
    onDelta: (ch, d) => deltas.push([ch, d])
  })

  assert.deepEqual(deltas, [['reasoning', '想'], ['text', '你好']])
  assert.equal(res.incomplete, true)
  // 验证自定义头安全清洗
  const headers = h.calls[0].init.headers
  assert.equal(headers['X-Safe'], 'ok')
  assert.equal(headers['Content-Type'], 'application/json')
  assert.equal(headers['X-Evil-Val'], undefined)
  assert.ok(!Object.keys(headers).some((k) => k.includes('\r') || k.includes('\n')))
})

test('Anthropic streaming handles thinking + temperature exclusion and complete stop marker', async () => {
  const h = clientHarness(() =>
    sseResponse([
      'data: {"type":"message_start","message":{"usage":{"input_tokens":12}}}\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"step"}}\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"}}\n\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}\n\n',
      'data: {"type":"message_stop"}\n\n'
    ])
  )
  const deltas = []
  const res = await h.streamChat({
    provider: anthropicProvider,
    apiKey: 'sk-ant',
    model: 'claude-test',
    messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }],
    reasoningLevel: 'medium',
    temperature: 0.5,
    maxTokens: 256,
    timeoutSec: 10,
    onDelta: (ch, d) => deltas.push([ch, d])
  })

  assert.deepEqual(deltas, [['reasoning', 'step'], ['text', 'ok']])
  assert.equal(res.incomplete, false)
  assert.deepEqual(JSON.parse(JSON.stringify(res.usage)), { promptTokens: 12, completionTokens: 5 })

  const sentBody = JSON.parse(h.calls[0].init.body)
  assert.deepEqual(sentBody.thinking, { type: 'adaptive' })
  assert.equal(sentBody.temperature, undefined, 'thinking enabled must omit temperature')

  // reasoning off 时允许发送 temperature
  await h.streamChat({
    provider: anthropicProvider,
    apiKey: 'sk-ant',
    model: 'claude-test',
    messages: [{ role: 'user', content: 'hi' }],
    reasoningLevel: 'off',
    temperature: 0.4,
    maxTokens: 256,
    timeoutSec: 10,
    onDelta: () => {}
  })
  const sentOffBody = JSON.parse(h.calls[1].init.body)
  assert.equal(sentOffBody.temperature, 0.4)
})

test('mid-stream user abort throws AbortError instead of generic AIError', async () => {
  const ctrl = new AbortController()
  const h = clientHarness(() => {
    ctrl.abort()
    return sseResponse(['data: {"choices":[{"delta":{"content":"a"}}]}\n\n', 'x'], {
      streamErrorAfterFirst: new Error('network closed on abort')
    })
  })
  await assert.rejects(
    () =>
      h.streamChat({
        provider: openaiProvider,
        apiKey: 'sk-test',
        model: 'm1',
        messages: [{ role: 'user', content: 'hi' }],
        reasoningLevel: 'off',
        temperature: null,
        maxTokens: 64,
        timeoutSec: 10,
        signal: ctrl.signal,
        onDelta: () => {}
      }),
    (err) => err && err.name === 'AbortError'
  )
})

test('fetchModels supports data/models shapes, deduplicates, filters non-chat, and keeps contextWindow', async () => {
  const h = clientHarness(() =>
    jsonResponse({
      models: [
        { name: 'z-model', context_length: 128000 },
        { id: 'a-model', context_window: 64000 },
        { id: 'a-model', context_window: 32000 },
        { id: 'text-embedding-3-large' }
      ]
    })
  )
  const res = await h.fetchModels(openaiProvider, 'sk-test')
  assert.equal(res.ok, true)
  assert.deepEqual(JSON.parse(JSON.stringify(res.models)), [
    { id: 'a-model', contextWindow: 64000 },
    { id: 'z-model', contextWindow: 128000 }
  ])
})

test('testProvider extracts Anthropic text block or OpenAI reasoning fallback sample', async () => {
  const hAn = clientHarness(() =>
    jsonResponse({
      content: [{ type: 'thinking', thinking: 'hmm' }, { type: 'text', text: 'ok' }]
    })
  )
  const r1 = await hAn.testProvider(anthropicProvider, 'sk-ant', 'claude-test')
  assert.equal(r1.ok, true)
  assert.equal(r1.sample, 'ok')

  const hOa = clientHarness(() =>
    jsonResponse({
      choices: [{ message: { content: '', reasoning_content: 'thinking ok' } }]
    })
  )
  const r2 = await hOa.testProvider(openaiProvider, 'sk-test', 'm1')
  assert.equal(r2.ok, true)
  assert.equal(r2.sample, 'thinking ok')
})
