import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { isLastChannel, useUiStore } from '../../app/stores/ui'

describe('last channel persistence', () => {
  it('rejects stale undefined route values', () => {
    expect(isLastChannel({ workspaceId: 'main', channelId: 'undefined' })).toBe(false)
    expect(isLastChannel({ workspaceId: 'undefined', channelId: 'channel-1' })).toBe(false)
    expect(isLastChannel({ workspaceId: 'main', channelId: 'channel-1' })).toBe(true)
  })
})

describe('composer state', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('keeps channel and thread drafts independent', () => {
    const ui = useUiStore()

    ui.setComposerDraft('channel-1', 'channel draft')
    ui.setComposerDraft('thread-1', 'thread draft')

    expect(ui.composerState('channel-1').draft).toBe('channel draft')
    expect(ui.composerState('thread-1').draft).toBe('thread draft')
  })

  it('scopes reply and edit targets to their composer', () => {
    const ui = useUiStore()

    ui.startReply('channel-1', 'message-1')
    ui.startEditing('thread-1', 'message-2', 'edit me')

    expect(ui.composerState('channel-1')).toMatchObject({
      draft: '',
      replyToId: 'message-1',
      editingId: null,
    })
    expect(ui.composerState('thread-1')).toMatchObject({
      draft: 'edit me',
      replyToId: null,
      editingId: 'message-2',
    })
  })
})
