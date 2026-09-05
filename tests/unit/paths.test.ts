import { describe, expect, it } from 'vitest'
import { canvasPath, channelPath, databasePath, documentPath } from '../../shared/paths'

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

describe('databasePath', () => {
  it('keeps the selected database in the URL', () => {
    expect(databasePath('db-1')).toBe('/databases?database=db-1')
  })

  it('can address the archived view', () => {
    expect(databasePath(null, true)).toBe('/databases?archived=1')
  })
})

describe('Data resource paths', () => {
  it('keeps the selected document in the URL', () => {
    expect(documentPath('doc 1')).toBe('/documents?document=doc%201')
  })

  it('keeps the selected canvas in the URL', () => {
    expect(canvasPath('canvas 1')).toBe('/canvases?canvas=canvas%201')
  })
})
