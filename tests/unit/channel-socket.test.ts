import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, toValue } from 'vue'
import type { useChannelSocket as ChannelSocketFactory } from '../../app/composables/useChannelSocket'

type Listener = (event: { data?: string }) => void

class FakeWebSocket {
  static readonly OPEN = 1
  static instances: FakeWebSocket[] = []

  readyState = 0
  sent: string[] = []
  private listeners = new Map<string, Listener[]>()

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this)
  }

  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  send(payload: string) {
    this.sent.push(payload)
  }

  close() {
    this.readyState = 3
    this.emit('close')
  }

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.emit('open')
  }

  message(message: unknown) {
    this.emit('message', { data: JSON.stringify(message) })
  }

  private emit(type: string, event: { data?: string } = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

let useChannelSocket: typeof ChannelSocketFactory
const queryData = new Map<string, unknown>()
const queryClient = {
  setQueryData: vi.fn(),
  setQueriesData: vi.fn((filters: { queryKey: string[] }, updater: (old: unknown) => unknown) => {
    for (const [key, value] of queryData) {
      if (key.startsWith(`${filters.queryKey[0]}:`) || key === filters.queryKey[0]) {
        queryData.set(key, updater(value))
      }
    }
  }),
  invalidateQueries: vi.fn(),
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
}

beforeAll(async () => {
  vi.stubGlobal('WebSocket', FakeWebSocket)
  vi.stubGlobal('location', { protocol: 'http:', host: 'localhost:3000' })
  vi.stubGlobal('toValue', toValue)
  vi.stubGlobal('watch', (_source: unknown, callback: () => void, options?: { immediate?: boolean }) => {
    if (options?.immediate) callback()
    return () => {}
  })
  vi.stubGlobal('onUnmounted', () => {})
  vi.stubGlobal('usePresenceStore', () => ({ markTyping: vi.fn(), apply: vi.fn() }))
  vi.stubGlobal('useHuddleStore', () => ({ setState: vi.fn() }))
  vi.stubGlobal('useUiStore', () => ({ dmFrozen: false, huddleSetupOpen: false }))
  vi.stubGlobal('useSessionStore', () => ({ user: null }))
  vi.stubGlobal('useNuxtApp', () => ({ $queryClient: queryClient }))
  vi.stubGlobal('useApi', () => ({
    api: vi.fn(async () => ({ token: 'test-token' })),
    socketUrl: (path: string) => `ws://localhost:3000${path}`,
  }))
  vi.stubGlobal('$fetch', vi.fn(async () => ({ token: 'test-token' })))
  ;({ useChannelSocket } = await import('../../app/composables/useChannelSocket'))
})

describe('channel read reconnect delivery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeWebSocket.instances = []
    queryData.clear()
    vi.clearAllMocks()
  })

  it('replays the latest unacknowledged read after reconnect', async () => {
    const channelId = ref('channel-1')
    const channel = useChannelSocket(channelId)
    await flush()

    const first = FakeWebSocket.instances[0]!
    first.open()
    first.message({ t: 'hello', channelId: 'channel-1', you: { id: 'user-1', displayName: 'A', avatarR2Key: null } })
    channel.send({ t: 'read', messageId: '01990000-0000-7000-8000-000000000001' })

    expect(first.sent.map(JSON.parse)).toContainEqual({
      t: 'read',
      messageId: '01990000-0000-7000-8000-000000000001',
    })

    first.close()
    await vi.advanceTimersByTimeAsync(1500)
    await flush()

    const second = FakeWebSocket.instances[1]!
    second.open()
    second.message({ t: 'hello', channelId: 'channel-1', you: { id: 'user-1', displayName: 'A', avatarR2Key: null } })

    expect(second.sent.map(JSON.parse)).toContainEqual({
      t: 'read',
      messageId: '01990000-0000-7000-8000-000000000001',
    })
    channel.disconnect()
  })

  it('stops replaying a read after the server acknowledges its persisted cursor', async () => {
    const channel = useChannelSocket(ref('channel-1'))
    await flush()

    const first = FakeWebSocket.instances[0]!
    first.open()
    first.message({ t: 'hello', channelId: 'channel-1', you: { id: 'user-1', displayName: 'A', avatarR2Key: null } })
    channel.send({ t: 'read', messageId: '01990000-0000-7000-8000-000000000001' })
    first.message({
      t: 'read.ack',
      channelId: 'channel-1',
      messageId: '01990000-0000-7000-8000-000000000001',
      unread: false,
    })

    first.close()
    await vi.advanceTimersByTimeAsync(1500)
    await flush()

    const second = FakeWebSocket.instances[1]!
    second.open()
    second.message({ t: 'hello', channelId: 'channel-1', you: { id: 'user-1', displayName: 'A', avatarR2Key: null } })

    expect(second.sent.map(JSON.parse)).not.toContainEqual({
      t: 'read',
      messageId: '01990000-0000-7000-8000-000000000001',
    })
    channel.disconnect()
  })

  it('coalesces reads to the newest cursor while disconnected', async () => {
    const channel = useChannelSocket(ref('channel-1'))
    await flush()

    const first = FakeWebSocket.instances[0]!
    first.open()
    first.message({ t: 'hello', channelId: 'channel-1', you: { id: 'user-1', displayName: 'A', avatarR2Key: null } })
    channel.send({ t: 'read', messageId: '01990000-0000-7000-8000-000000000002' })
    first.close()
    channel.send({ t: 'read', messageId: '01990000-0000-7000-8000-000000000001' })

    await vi.advanceTimersByTimeAsync(1500)
    await flush()
    const second = FakeWebSocket.instances[1]!
    second.open()
    second.message({ t: 'hello', channelId: 'channel-1', you: { id: 'user-1', displayName: 'A', avatarR2Key: null } })

    const replayedReads = second.sent.map(JSON.parse).filter(message => message.t === 'read')
    expect(replayedReads).toEqual([{
      t: 'read',
      messageId: '01990000-0000-7000-8000-000000000002',
    }])
    channel.disconnect()
  })

  it('updates a direct channel unread badge only after the persisted read acknowledgement', async () => {
    queryData.set('channels:main', { channels: [{ id: 'channel-1', unread: true }] })
    const channel = useChannelSocket(ref('channel-1'))
    await flush()

    const socket = FakeWebSocket.instances[0]!
    socket.open()
    socket.message({ t: 'hello', channelId: 'channel-1', you: { id: 'user-1', displayName: 'A', avatarR2Key: null } })
    channel.send({ t: 'read', messageId: '01990000-0000-7000-8000-000000000001' })

    expect(queryData.get('channels:main')).toEqual({ channels: [{ id: 'channel-1', unread: true }] })

    socket.message({
      t: 'read.ack',
      channelId: 'channel-1',
      messageId: '01990000-0000-7000-8000-000000000001',
      unread: false,
    })

    expect(queryData.get('channels:main')).toEqual({ channels: [{ id: 'channel-1', unread: false }] })
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled()
    channel.disconnect()
  })

  it('refetches aggregate lists after a thread read acknowledgement', async () => {
    queryData.set('channels:main', { channels: [{ id: 'parent-1', unread: true }] })
    queryData.set('dms', { channels: [] })
    const channel = useChannelSocket(ref('thread-1'))
    await flush()

    const socket = FakeWebSocket.instances[0]!
    socket.open()
    socket.message({ t: 'hello', channelId: 'thread-1', you: { id: 'user-1', displayName: 'A', avatarR2Key: null } })
    socket.message({
      t: 'read.ack',
      channelId: 'thread-1',
      messageId: '01990000-0000-7000-8000-000000000001',
      unread: false,
    })

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['channels'] })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['dms'] })
    channel.disconnect()
  })

  it('applies realtime pin changes and refreshes the pins panel', async () => {
    const channel = useChannelSocket(ref('channel-1'))
    await flush()

    const socket = FakeWebSocket.instances[0]!
    socket.open()
    socket.message({ t: 'hello', channelId: 'channel-1', you: { id: 'user-1', displayName: 'A', avatarR2Key: null } })
    const pin = {
      pinnedBy: { id: 'user-1', displayName: 'A', avatarR2Key: null },
      pinnedAt: '2026-09-04T12:00:00.000Z',
    }
    socket.message({ t: 'pin', messageId: 'message-1', pin })

    const update = queryClient.setQueryData.mock.calls.at(-1)?.[1] as (current: unknown) => unknown
    const current = {
      pages: [{
        messages: [{ id: 'message-1', pin: null }, { id: 'message-2', pin: null }],
        nextCursor: null,
      }],
      pageParams: [undefined],
    }
    expect(update(current)).toEqual({
      pages: [{
        messages: [{ id: 'message-1', pin }, { id: 'message-2', pin: null }],
        nextCursor: null,
      }],
      pageParams: [undefined],
    })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['pins', 'channel-1'] })
    channel.disconnect()
  })
})
