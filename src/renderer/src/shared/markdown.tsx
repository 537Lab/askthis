import { useEffect, useMemo, useRef } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({
  gfm: true,
  breaks: true
})

const SAFE_LANG_CLASS = /^language-[a-z0-9_+-]+$/i

/**
 * 将 Markdown 解析并清洗为安全 HTML：
 * 禁止图片、脚本与原生 HTML；仅允许 <code> 保留单个安全的 language-* 类名。
 */
export function renderSafeMarkdown(text: string): string {
  try {
    const raw = marked.parse(text) as string
    const hook = (
      node: Element,
      data: { attrName: string; attrValue: string; keepAttr: boolean }
    ): void => {
      if (data.attrName !== 'class') return
      if (node.tagName === 'CODE') {
        const safeToken = data.attrValue
          .split(/\s+/)
          .find((token) => SAFE_LANG_CLASS.test(token))
        if (safeToken) {
          data.attrValue = safeToken.toLowerCase()
          return
        }
      }
      data.keepAttr = false
    }

    if (typeof DOMPurify.addHook === 'function') {
      DOMPurify.addHook('uponSanitizeAttribute', hook)
    }
    try {
      return DOMPurify.sanitize(raw, {
        ALLOWED_TAGS: [
          'p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote',
          'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr'
        ],
        ALLOWED_ATTR: ['href', 'title', 'class'],
        ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i
      })
    } finally {
      if (typeof DOMPurify.removeHook === 'function') {
        DOMPurify.removeHook('uponSanitizeAttribute')
      }
    }
  } catch {
    return escapeHtml(text)
  }
}

/**
 * Renders model output as sanitized markdown.
 * Kept intentionally strict: no images, no raw HTML, no scripts.
 */
export function Markdown({
  text,
  className,
  onCopyCode,
  copyLabel = '复制代码',
  copiedLabel = '已复制'
}: {
  text: string
  className?: string
  onCopyCode?: (code: string) => void
  copyLabel?: string
  copiedLabel?: string
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const copyRef = useRef(onCopyCode)
  copyRef.current = onCopyCode

  const html = useMemo(() => renderSafeMarkdown(text), [text])

  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const timers: number[] = []
    const pres = Array.from(root.querySelectorAll('pre'))
    for (const pre of pres) {
      if (pre.querySelector('.at-code-bar')) continue
      const codeEl = pre.querySelector('code')
      const langMatch = codeEl?.className.match(/\blanguage-([a-z0-9_+-]+)/i)
      const lang = langMatch ? langMatch[1] : ''

      pre.classList.add('at-code-wrap')
      const bar = document.createElement('div')
      bar.className = 'at-code-bar'

      const langSpan = document.createElement('span')
      langSpan.className = 'at-code-lang'
      langSpan.textContent = lang

      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'at-code-copy'
      btn.textContent = copyLabel
      btn.setAttribute('aria-label', copyLabel)

      let timerId = 0
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation()
        const codeText = (codeEl?.textContent ?? pre.textContent ?? '').replace(/\n$/, '')
        if (copyRef.current) {
          copyRef.current(codeText)
        } else {
          void navigator.clipboard?.writeText(codeText).catch(() => {})
        }
        btn.textContent = copiedLabel
        btn.setAttribute('data-copied', 'true')
        if (timerId) window.clearTimeout(timerId)
        timerId = window.setTimeout(() => {
          btn.textContent = copyLabel
          btn.removeAttribute('data-copied')
        }, 1600)
        timers.push(timerId)
      })

      bar.append(langSpan, btn)
      pre.prepend(bar)
    }

    return () => {
      for (const id of timers) window.clearTimeout(id)
    }
  }, [html, copyLabel, copiedLabel])

  return <div ref={containerRef} className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}
