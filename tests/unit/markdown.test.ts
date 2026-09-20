import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../../shared/markdown'
import { extractMentionIds, applyMentionTokens } from '../../shared/mentions'

describe('markdown', () => {
  it('escapes html', () => {
    const html = renderMarkdown('<script>alert(1)</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('rejects javascript urls', () => {
    const html = renderMarkdown('[x](javascript:alert(1))')
    expect(html).not.toContain('javascript:')
  })

  it('renders bold and code', () => {
    const html = renderMarkdown('**hi** and `code`')
    expect(html).toContain('<strong>hi</strong>')
    expect(html).toContain('<code>code</code>')
  })
})

describe('mentions', () => {
  it('extracts ids', () => {
    const id = '01900000-0000-7000-8000-000000000001'
    expect(extractMentionIds(`hello <@${id}>`)).toEqual([id])
  })

  it('tokenizes @name', () => {
    const id = '01900000-0000-7000-8000-000000000001'
    const out = applyMentionTokens('hey @Ada', [{ id, displayName: 'Ada' }])
    expect(out).toBe(`hey <@${id}>`)
  })
})
