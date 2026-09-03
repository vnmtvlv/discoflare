import { describe, expect, it } from 'vitest'
import { dmTitle, normalizeChannelType } from '../../shared/dm'
import { formatBytes } from '../../shared/format'

describe('dmTitle', () => {
  const users = [
    { id: '1', displayName: 'Ada', email: 'a@x', avatarR2Key: null },
    { id: '2', displayName: 'Bob', email: 'b@x', avatarR2Key: null },
    { id: '3', displayName: 'Cara', email: 'c@x', avatarR2Key: null },
    { id: '4', displayName: 'Dan', email: 'd@x', avatarR2Key: null },
  ]
  it('uses explicit name', () => {
    expect(dmTitle('Core', users, '1')).toBe('Core')
  })
  it('treats placeholder dm as unnamed', () => {
    expect(dmTitle('dm', users.slice(0, 2), '1')).toBe('Bob')
  })
  it('1:1 uses the other person', () => {
    expect(dmTitle(null, users.slice(0, 2), '1')).toBe('Bob')
  })
  it('group lists names then others', () => {
    expect(dmTitle(null, users, '1')).toBe('Bob, Cara, Dan')
  })
})

describe('normalizeChannelType', () => {
  it('maps huddle to voice', () => {
    expect(normalizeChannelType('huddle')).toBe('voice')
  })
})

describe('formatBytes', () => {
  it('formats kilobytes', () => {
    expect(formatBytes(2048)).toBe('2 KB')
  })
})
