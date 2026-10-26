const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadSource } = require('./load-source.cjs')
const React = require('react')

function popupHarness({ needsPermission = true, draft = ' typed question ', turns = [], status = 'idle' } = {}) {
  const calls = [], effects = [], refs = [], timers = [], listeners = {}
  const state = { needsPermission, question: '', turns, status, activationSeq: 1, addUserTurn: (text) => calls.push(['turn', text]) }
  const usePopupStore = (select) => select ? select(state) : state
  usePopupStore.getState = () => state
  const empty = () => null
  const { App } = loadSource('src/renderer/src/popup/App.tsx', {
    react: { ...React, useEffect: (effect) => effects.push(effect), useRef: () => { const ref = { current: null }; refs.push(ref); return ref }, useState: (initial) => [initial === '' ? draft : typeof initial === 'function' ? initial() : initial, () => {}] },
    './state': { usePopupStore },
    '../shared/ui': { useT: () => (key) => key, LocaleProvider: empty, Button: empty, IconButton: empty, Spinner: empty },
    '../shared/icons': { CloseIcon: empty, CopyIcon: empty, CheckIcon: empty, StopIcon: empty, LockIcon: empty, LogoIcon: empty },
    '../shared/markdown': { Markdown: empty }
  }, { navigator: { language: 'en-US' }, window: {
    api: { popup: { send: (text) => calls.push(['send', text]), close: () => calls.push(['close']) } },
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
  return { calls, effects, refs, timers, listeners, find: (predicate) => find(tree, predicate), input: find(tree, (el) => el.type === 'input') }
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
  h.refs[1].current = { focus: () => h.calls.push(['focus']) }
  h.effects.forEach((effect) => effect())
  h.timers.forEach((callback) => callback())
  assert.ok(h.calls.some(([action]) => action === 'focus'))
  h.input.props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: false }, preventDefault() {} })
  assert.ok(h.calls.some(([action, text]) => action === 'send' && text === 'typed question'))
})
