import { describe, expect, it } from 'vitest'
import { channelPath } from '../../shared/paths'

describe('channelPath', () => {
  it('is /channels/{id} with no workspace id', () => {
    expect(channelPath('01a062c5-7334-710d-8c61-2602284dfe22')).toBe('/channels/01a062c5-7334-710d-8c61-2602284dfe22')
  })
  it('uses the channel id even when a name is present', () => {
    expect(channelPath({ id: 'abc', name: 'общий', type: 'text' })).toBe('/channels/abc')
  })
  it('appends threads', () => {
    expect(channelPath({ id: 'abc' }, 'thr')).toBe('/channels/abc/threads/thr')
  })
})
