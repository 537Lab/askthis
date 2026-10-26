const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadSource } = require('./load-source.cjs')
const React = require('react')

function popupHarness({ needsPermission = true, draft = ' typed question ', turns = [], status = 'idle', question = '', config = null } = {}) {
  const calls = [], effects = [], refs = [], timers = [], listeners = {}
  const state = { config, needsPermission, question, turns, status, activationSeq: 1, addUserTurn: (text) => calls.push(['turn', text]) }
  const usePopupStore = (select) => select ? select(state) : state
  usePopupStore.getState = () => state
  const empty = () => null
  const { App } = loadSource('src/renderer/src/popup/App.tsx', {
    react: { ...React, useEffect: (effect) => effects.push(effect), useLayoutEffect: (effect) => effects.push(effect), useRef: (initial) => { const ref = { current: initial }; refs.push(ref); return ref }, useState: (initial) => [initial === '' ? draft : typeof initial === 'function' ? initial() : initial, () => {}] },
    './state': { usePopupStore },
    '../shared/ui': { useT: () => (key) => key, LocaleProvider: empty, Button: empty, IconButton: empty, Spinner: empty },
    '../shared/icons': { CloseIcon: empty, CopyIcon: empty, CheckIcon: empty, StopIcon: empty, LockIcon: empty, LogoIcon: empty },
    '../shared/markdown': { Markdown: empty }
  }, { navigator: { language: 'en-US' }, window: {
    api: { popup: { copy: (text) => calls.push(['copy', text]), regenerate: () => calls.push(['regenerate']), send: (text) => calls.push(['send', text]), close: () => calls.push(['close']), stop: () => calls.push(['stop']) } },
    setTimeout: (callback) => { timers.push(callback); return timers.length }, clearTimeout: () => {},
    addEventListener: (type, callback) => { listeners[type] = callback }, removeEventListener: () => {}
  } })
  const card = App().props.children.type
  effects.length = 0
  refs.length = 0
  const tree = card()
  function find(element, predicate) {
    if (!element || typeof element !== 'object') return null
    if (predicate(element)) return element
    for (const child of [element.props?.children].flat(Infinity)) {
      const found = find(child, predicate)
      if (found) return found
    }
    return null
  }
  return { calls, effects, refs, timers, listeners, find: (predicate) => find(tree, predicate), inTree: find, input: find(tree, (el) => el.props?.className === 'composer__input') }
}

test('Enter ignores IME composition and whitespace-only input', () => {
  const h = popupHarness({ needsPermission: false })
  h.input.props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: true }, preventDefault() {} })
  assert.equal(h.calls.length, 0)
  const blank = popupHarness({ draft: '   ' })
  blank.input.props.onKeyDown({ key: 'Enter', nativeEvent: {}, preventDefault() {} })
  assert.equal(blank.calls.length, 0)
})

test('Escape closes the card except during IME composition', () => {
  const h = popupHarness()
  h.effects.forEach((effect) => effect())
  h.listeners.keydown({ key: 'Escape', isComposing: true })
  h.listeners.keydown({ key: 'Escape', keyCode: 229 })
  assert.equal(h.calls.length, 0)
  h.listeners.keydown({ key: 'Escape' })
  assert.deepEqual(h.calls, [['close']])
})

test('IME keyCode 229 Enter never submits a partial composition', () => {
  const h = popupHarness({ needsPermission: false })
  h.input.props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: false, keyCode: 229 }, preventDefault() {} })
  assert.equal(h.calls.length, 0)
})

test('manual results and retry controls remain visible without Accessibility', () => {
  const h = popupHarness({ turns: [{ q: 'manual', a: '', error: 'NO_PROVIDER' }], status: 'error' })
  assert.ok(h.find((el) => el.type?.name === 'TurnView'), 'must show manually submitted turns')
  assert.ok(h.find((el) => el.props?.children === 'popup.retry'), 'must allow retrying manual queries')
})

test('permission warning is non-blocking: composer exists and receives activation focus', () => {
  const h = popupHarness()
  assert.ok(h.input, 'manual composer must remain available without Accessibility')
  h.refs[1].current = { style: {}, scrollHeight: 26, focus: () => h.calls.push(['focus']) }
  h.effects.forEach((effect) => effect())
  h.timers.forEach((callback) => callback())
  assert.ok(h.calls.some(([action]) => action === 'focus'))
  h.input.props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: false }, preventDefault() {} })
  assert.ok(h.calls.some(([action, text]) => action === 'send' && text === 'typed question'))
})


test('a manually started conversation uses follow-up semantics after its first turn', () => {
  const h = popupHarness({ needsPermission: false, turns: [{ q: 'typed', a: 'answer' }], status: 'done' })
  assert.equal(h.input.props.placeholder, 'popup.ask.placeholder')
})

test('composer supports multiline drafts and Shift+Enter never sends', () => {
  const h = popupHarness({ needsPermission: false })
  assert.equal(h.input.type, 'textarea')
  h.input.props.onKeyDown({ key: 'Enter', shiftKey: true, nativeEvent: {}, preventDefault() { assert.fail('must allow newline') } })
  assert.equal(h.calls.length, 0)
})

test('composer offers an explicit send action and contextual stop while busy', () => {
  const ready = popupHarness({ needsPermission: false })
  const send = ready.find((el) => el.props?.['aria-label'] === 'popup.send')
  assert.ok(send)
  send.props.onClick()
  assert.deepEqual(ready.calls, [['turn', 'typed question'], ['send', 'typed question']])
  for (const status of ['waiting', 'streaming']) {
    const busy = popupHarness({ status })
    const stop = busy.find((el) => el.props?.['aria-label'] === 'popup.stop')
    assert.ok(stop)
    stop.props.onClick()
    assert.deepEqual(busy.calls, [['stop']])
  }
})

test('copy belongs to the answer and keeps the conversation open', () => {
  const h = popupHarness({ turns: [{ q: 'first', a: 'answer', reasoning: '', error: null }], status: 'done' })
  const turn = h.find((el) => el.type?.name === 'TurnView')
  const rendered = turn.type(turn.props)
  const copy = h.inTree(rendered, (el) => el.props?.['aria-label'] === 'popup.copy')
  assert.ok(copy, 'answer has its own copy action')
  copy.props.onClick()
  h.timers.forEach((cb) => cb())
  assert.deepEqual(h.calls, [['copy', 'answer']])
})

test('stopping before the first answer token retains a regenerate action', () => {
  for (const reasoning of ['', 'thinking only']) {
    const h = popupHarness({ turns: [{ q: 'first', a: '', reasoning, error: null, stopped: true }], status: 'done' })
    const turn = h.find((el) => el.type?.name === 'TurnView')
    const rendered = turn.type(turn.props)
    const regenerate = h.inTree(rendered, (el) => el.props?.['aria-label'] === 'popup.regenerate')
    assert.ok(regenerate)
    assert.equal(h.inTree(rendered, (el) => el.props?.['aria-label'] === 'popup.copy'), null)
    regenerate.props.onClick()
    assert.deepEqual(h.calls, [['regenerate']])
  }
})

test('a completed empty or reasoning-only response can regenerate without an empty copy action', () => {
  for (const reasoning of ['', 'thinking only']) {
    const h = popupHarness({ turns: [{ q: 'first', a: '', reasoning, error: null, stopped: false }], status: 'done' })
    const turn = h.find((el) => el.type?.name === 'TurnView')
    const rendered = turn.type(turn.props)
    const regenerate = h.inTree(rendered, (el) => el.props?.['aria-label'] === 'popup.regenerate')
    assert.ok(regenerate)
    assert.equal(h.inTree(rendered, (el) => el.props?.['aria-label'] === 'popup.copy'), null)
    regenerate.props.onClick()
    assert.deepEqual(h.calls, [['regenerate']])
  }
})

test('small window caps reserve room for header and controls instead of clipping drafts', () => {
  const h = popupHarness({ config: { maxWindowHeight: 200 } })
  const style = {}
  h.refs[1].current = { style, scrollHeight: 300 }
  h.effects.forEach((effect) => effect())
  assert.ok(parseInt(style.height) <= 32)
  assert.equal(h.input.props.style.maxHeight, 30)
})

test('keyboard help is on demand: empty capture or a real draft, not every answer', () => {
  const turns = [{ q: 'term', a: 'explanation' }]
  const idle = popupHarness({ turns, status: 'done', draft: '' })
  assert.equal(idle.find((el) => el.props?.className === 'composer__hints').props.hidden, true)
  const draft = popupHarness({ turns, status: 'streaming', draft: 'next question' })
  assert.equal(draft.find((el) => el.props?.className === 'composer__hints').props.hidden, false)
  const empty = popupHarness({ draft: '' })
  assert.equal(empty.find((el) => el.props?.className === 'composer__hints').props.hidden, false)
})

test('streaming keeps the draft editable but never submits another request', () => {
  for (const status of ['waiting', 'streaming']) {
    const h = popupHarness({ needsPermission: false, turns: [{ q: 'first', a: '' }], status })
    assert.notEqual(h.input.props.disabled, true)
    h.input.props.onKeyDown({ key: 'Enter', nativeEvent: {}, preventDefault() {} })
    assert.equal(h.calls.length, 0)
  }
})
