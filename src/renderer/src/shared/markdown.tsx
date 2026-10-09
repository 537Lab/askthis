import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({
  gfm: true,
  breaks: true
})

/**
 * Renders model output as sanitized markdown.
 * Kept intentionally strict: no images, no raw HTML, no scripts.
 */
export function Markdown({ text, className }: { text: string; className?: string }): React.JSX.Element {
  const html = useMemo(() => {
    try {
      const raw = marked.parse(text) as string
      return DOMPurify.sanitize(raw, {
        ALLOWED_TAGS: [
          'p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote',
          'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr'
        ],
        ALLOWED_ATTR: ['href', 'title'],
        ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i
      })
    } catch {
      return escapeHtml(text)
    }
  }, [text])

  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}
