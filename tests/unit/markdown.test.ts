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

describe('lists', () => {
  it('renders bulleted and numbered lists', () => {
    expect(renderMarkdown('- one\n- **two**')).toBe('<ul><li>one</li><li><strong>two</strong></li></ul>')
    expect(renderMarkdown('* a\n* b')).toBe('<ul><li>a</li><li>b</li></ul>')
    expect(renderMarkdown('1. first\n2) second')).toBe('<ol><li>first</li><li>second</li></ol>')
  })

  it('keeps a numbered list starting point and separates mixed lists', () => {
    expect(renderMarkdown('3. three\n4. four')).toBe('<ol start="3"><li>three</li><li>four</li></ol>')
    expect(renderMarkdown('- bullet\n1. number')).toBe('<ul><li>bullet</li></ul><ol><li>number</li></ol>')
  })

  it('leaves emphasis and plain text alone', () => {
    expect(renderMarkdown('*not a list*')).toBe('<p><em>not a list</em></p>')
    expect(renderMarkdown('-no space')).toBe('<p>-no space</p>')
    expect(renderMarkdown('- <b>x</b>')).toBe('<ul><li>&lt;b&gt;x&lt;/b&gt;</li></ul>')
  })
})
