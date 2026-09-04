import type { InfiniteData } from '@tanstack/vue-query'
import { describe, expect, it } from 'vitest'
import { mergeMessageContext, type MessagePage } from '../../app/utils/message-cache'
import type { MessageContextResponse, MessageDTO } from '../../shared/types'

function message(id: string, createdAt: string, content = id): MessageDTO {
  return {
    id,
    channelId: 'channel-1',
    workspaceId: 'main',
    author: { id: 'user-1', displayName: 'Ada', avatarR2Key: null },
    content,
    replyTo: null,
    mentions: [],
    attachments: [],
    reactions: [],
    pin: null,
    threadId: null,
    editedAt: null,
    deletedAt: null,
    createdAt,
  }
}

function context(messages: MessageDTO[], hasOlder: boolean): MessageContextResponse {
  return {
    messages,
    targetId: messages.at(-1)?.id ?? '',
    targetIndex: Math.max(0, messages.length - 1),
    hasOlder,
    hasNewer: false,
  }
}

describe('mergeMessageContext', () => {
  it('deduplicates and orders the combined context chronologically', () => {
    const current: InfiniteData<MessagePage> = {
      pages: [{
        messages: [
          message('m3', '2026-09-04T00:03:00.000Z'),
          message('m4', '2026-09-04T00:04:00.000Z'),
        ],
        nextCursor: 'm3',
      }],
      pageParams: [undefined],
    }
    const result = mergeMessageContext(current, context([
      message('m1', '2026-09-04T00:01:00.000Z'),
      message('m2', '2026-09-04T00:02:00.000Z'),
      message('m3', '2026-09-04T00:03:00.000Z', 'fresh'),
    ], false))

    expect(result.pages[0]?.messages.map(item => item.id)).toEqual(['m1', 'm2', 'm3', 'm4'])
    expect(result.pages[0]?.messages.find(item => item.id === 'm3')?.content).toBe('fresh')
    expect(result.pages[0]?.nextCursor).toBeNull()
  })

  it('uses the context cursor when the context contributes the oldest message', () => {
    const current: InfiniteData<MessagePage> = {
      pages: [{ messages: [message('m4', '2026-09-04T00:04:00.000Z')], nextCursor: 'm4' }],
      pageParams: [undefined],
    }
    const result = mergeMessageContext(current, context([
      message('m2', '2026-09-04T00:02:00.000Z'),
      message('m3', '2026-09-04T00:03:00.000Z'),
    ], true))

    expect(result.pages[0]?.nextCursor).toBe('m2')
  })

  it('uses only the oldest current page to determine remaining history', () => {
    const current: InfiniteData<MessagePage> = {
      pages: [
        { messages: [message('m4', '2026-09-04T00:04:00.000Z')], nextCursor: 'm4' },
        { messages: [message('m1', '2026-09-04T00:01:00.000Z')], nextCursor: null },
      ],
      pageParams: [undefined, 'm4'],
    }
    const result = mergeMessageContext(current, context([
      message('m2', '2026-09-04T00:02:00.000Z'),
      message('m3', '2026-09-04T00:03:00.000Z'),
    ], true))

    expect(result.pages[0]?.nextCursor).toBeNull()
  })
})
