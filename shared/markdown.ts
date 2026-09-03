const DANGEROUS_PROTO = /^(javascript|data|vbscript):/i

export function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function safeHref(raw: string): string | null {
  const href = raw.trim()
  if (DANGEROUS_PROTO.test(href)) return null
  if (href.startsWith('/') || href.startsWith('#') || href.startsWith('https://') || href.startsWith('http://') || href.startsWith('mailto:')) {
    return escapeHtml(href)
  }
  return null
}

function inline(src: string): string {
  let out = escapeHtml(src)
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>')
  out = out.replace(/(^|[^_])_([^_]+)_(?!_)/g, '$1<em>$2</em>')
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, url: string) => {
    const href = safeHref(url)
    if (!href) return label
    return `<a href="${href}" rel="noopener noreferrer" target="_blank">${label}</a>`
  })
  out = out.replace(/\bhttps?:\/\/[^\s<]+/g, (url) => {
    const href = safeHref(url)
    if (!href) return url
    return `<a href="${href}" rel="noopener noreferrer" target="_blank">${href}</a>`
  })
  out = out.replace(
    /&lt;@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})&gt;/gi,
    '<span class="mention" data-user-id="$1">@$1</span>',
  )
  return out
}

export function renderMarkdown(src: string, names?: Record<string, string>): string {
  const fences: string[] = []
  const withFences = src.replace(/```([\s\S]*?)```/g, (_m, code: string) => {
    const i = fences.length
    fences.push(`<pre><code>${escapeHtml(code.replace(/^\n/, ''))}</code></pre>`)
    return `\n%%FENCE${i}%%\n`
  })

  const lines = withFences.split('\n')
  const html: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    const fence = line.match(/^%%FENCE(\d+)%%$/)
    if (fence) {
      html.push(fences[Number(fence[1])] ?? '')
      i += 1
      continue
    }
    if (line.startsWith('> ')) {
      const quote: string[] = []
      while (i < lines.length && (lines[i] ?? '').startsWith('> ')) {
        quote.push((lines[i] ?? '').slice(2))
        i += 1
      }
      html.push(`<blockquote>${quote.map((q) => inline(q)).join('<br>')}</blockquote>`)
      continue
    }
    if (line.trim() === '') {
      i += 1
      continue
    }
    html.push(`<p>${inline(line)}</p>`)
    i += 1
  }

  let out = html.join('')
  if (names) {
    out = out.replace(/<span class="mention" data-user-id="([^"]+)">@[^<]+<\/span>/g, (full, id: string) => {
      const name = names[id.toLowerCase()] ?? names[id]
      if (!name) return full
      return `<span class="mention" data-user-id="${id}">@${escapeHtml(name)}</span>`
    })
  }
  return out
}
