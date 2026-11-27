const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadSource } = require('./load-source.cjs')

test('renderSafeMarkdown enforces strict DOMPurify allowlists and safe language-* class hook', () => {
  const hooks = new Map()
  let capturedOpts = null
  let removed = false

  const { renderSafeMarkdown } = loadSource('src/renderer/src/shared/markdown.tsx', {
    dompurify: {
      __esModule: true,
      default: {
        addHook: (name, fn) => hooks.set(name, fn),
        removeHook: (name) => { if (name === 'uponSanitizeAttribute') removed = true },
        sanitize: (html, opts) => {
          capturedOpts = opts
          return html
        }
      }
    }
  })

  const out = renderSafeMarkdown('```ts\nconst x = 1\n```')
  assert.ok(out.includes('class="language-ts"'))
  assert.equal(removed, true)
  assert.ok(capturedOpts.ALLOWED_TAGS.includes('code'))
  assert.ok(!capturedOpts.ALLOWED_TAGS.includes('script'))
  assert.ok(!capturedOpts.ALLOWED_TAGS.includes('img'))
  assert.equal(capturedOpts.ALLOWED_URI_REGEXP.test('javascript:alert(1)'), false)
  assert.equal(capturedOpts.ALLOWED_URI_REGEXP.test('https://example.com'), true)

  const hook = hooks.get('uponSanitizeAttribute')
  assert.equal(typeof hook, 'function')

  // <code> 允许保留单个安全的 language-* 类名并小写化
  const codeGood = { attrName: 'class', attrValue: 'evil-class language-TS extra', keepAttr: true }
  hook({ tagName: 'CODE' }, codeGood)
  assert.equal(codeGood.keepAttr, true)
  assert.equal(codeGood.attrValue, 'language-ts')

  // <code> 不含合法 language-* 类名则剔除 class
  const codeBad = { attrName: 'class', attrValue: 'evil-class', keepAttr: true }
  hook({ tagName: 'CODE' }, codeBad)
  assert.equal(codeBad.keepAttr, false)

  // 非 <code> 元素一律剔除 class
  const pTag = { attrName: 'class', attrValue: 'language-ts', keepAttr: true }
  hook({ tagName: 'P' }, pTag)
  assert.equal(pTag.keepAttr, false)
})
