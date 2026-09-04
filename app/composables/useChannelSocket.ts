import type { InfiniteData, QueryClient } from '@tanstack/vue-query'
import type { ChannelDTO, ClientMsg, MessageDTO, ServerMsg } from '~~/shared/types'

type Page = { messages: MessageDTO[]; nextCursor: string | null }
type ChannelList = { channels: ChannelDTO[] }

export function useChannelSocket(channelId: MaybeRefOrGetter<string>) {
  const { api, socketUrl } = useApi()
  const presence = usePresenceStore()
  const huddle = useHuddleStore()
  const nuxt = useNuxtApp()

  let ws: WebSocket | null = null
  let closed = false
  let attempt = 0
  let connecting = false
  let generation = 0
  let authenticated = false
  const pending: ClientMsg[] = []
  const outstanding = new Map<string, Extract<ClientMsg, { t: 'message.create' }>>()
  let pendingRead: Extract<ClientMsg, { t: 'read' }> | null = null

  function queryClient(): QueryClient | undefined {
    return nuxt.$queryClient as QueryClient | undefined
  }

  function applyMessage(msg: MessageDTO) {
    const qc = queryClient()
    if (!qc) return
    qc.setQueryData<InfiniteData<Page>>(['messages', msg.channelId], (old) => {
      if (!old?.pages?.length) {
        return { pages: [{ messages: [msg], nextCursor: null }], pageParams: [undefined] }
      }
      const exists = old.pages.some((p) => p.messages.some((m) => m.id === msg.id || (msg.clientId && m.clientId === msg.clientId)))
      const pages = old.pages.map((p, i) => {
        if (i !== 0) return p
        if (exists) {
          return {
            ...p,
            messages: p.messages.map((m) => (m.id === msg.id || (msg.clientId && m.clientId === msg.clientId) ? msg : m)),
          }
        }
        return { ...p, messages: [...p.messages, msg] }
      })
      return { ...old, pages }
    })
    if (msg.attachments.length) void qc.invalidateQueries({ queryKey: ['files'] })
    void qc.invalidateQueries({ queryKey: ['threads'] })
  }

  function applyReadAck(channelId: string, unread: boolean) {
    const qc = queryClient()
    if (!qc) return
    let directChannel = false
    const update = (old: ChannelList | undefined) => {
      if (!old?.channels.some(channel => channel.id === channelId)) return old
      directChannel = true
      return {
        ...old,
        channels: old.channels.map(channel => channel.id === channelId ? { ...channel, unread } : channel),
      }
    }
    qc.setQueriesData<ChannelList>({ queryKey: ['channels'] }, update)
    qc.setQueriesData<ChannelList>({ queryKey: ['dms'] }, update)
    if (!directChannel) {
      void qc.invalidateQueries({ queryKey: ['channels'] })
      void qc.invalidateQueries({ queryKey: ['dms'] })
    }
  }

  async function connect(gen = generation) {
    const id = toValue(channelId)
    if (!id || !import.meta.client || connecting || closed) return
    connecting = true
    try {
      const { token } = await api<{ token: string }>('/api/auth/ws-token', { method: 'POST' })
      if (closed || gen !== generation) return
      const socket = new WebSocket(socketUrl(`/ws/channel/${id}`))
      ws = socket
      socket.addEventListener('open', () => {
        if (gen !== generation) return socket.close()
        attempt = 0
        socket.send(JSON.stringify({ t: 'auth', token } satisfies ClientMsg))
      })
      socket.addEventListener('message', (ev) => {
        if (typeof ev.data !== 'string' || ev.data === 'pong') return
        let parsed: ServerMsg
        try { parsed = JSON.parse(ev.data) as ServerMsg }
        catch { return }
        switch (parsed.t) {
          case 'hello':
            authenticated = true
            for (const message of outstanding.values()) socket.send(JSON.stringify(message))
            for (const queued of pending.splice(0)) socket.send(JSON.stringify(queued))
            if (pendingRead) socket.send(JSON.stringify(pendingRead))
            if (parsed.huddle) huddle.setState(parsed.huddle)
            useUiStore().dmFrozen = Boolean(parsed.frozen)
            break
          case 'message':
            applyMessage(parsed.message)
            break
          case 'message.update':
            applyMessage(parsed.message)
            break
          case 'thread.created': {
            const qc = queryClient()
            qc?.setQueryData<InfiniteData<Page>>(['messages', id], (old) => {
              if (!old) return old
              return {
                ...old,
                pages: old.pages.map(page => ({
                  ...page,
                  messages: page.messages.map(message => message.id === parsed.messageId
                    ? { ...message, threadId: parsed.threadId }
                    : message),
                })),
              }
            })
            void qc?.invalidateQueries({ queryKey: ['threads', id] })
            break
          }
          case 'message.delete': {
            const qc = queryClient()
            qc?.setQueryData<InfiniteData<Page>>(['messages', id], (old) => {
              if (!old) return old
              return {
                ...old,
                pages: old.pages.map((p) => ({
                  ...p,
                  messages: p.messages.map((m) => m.id === parsed.id ? { ...m, deletedAt: new Date().toISOString(), content: '' } : m),
                })),
              }
            })
            void qc?.invalidateQueries({ queryKey: ['pins', id] })
            break
          }
          case 'ack':
            outstanding.delete(parsed.clientId)
            break
          case 'typing':
            presence.markTyping(id, parsed.userId)
            break
          case 'presence':
            presence.apply(parsed.users)
            break
          case 'huddle':
          case 'voice':
            huddle.setState(parsed.t === 'voice' ? parsed.voice : parsed.huddle)
            break
          case 'dm.participants':
            void queryClient()?.invalidateQueries({ queryKey: ['dms'] })
            break
          case 'dm.update':
            void queryClient()?.invalidateQueries({ queryKey: ['dms'] })
            break
          case 'reaction': {
            const qc = queryClient()
            qc?.setQueryData<InfiniteData<Page>>(['messages', id], (old) => {
              if (!old) return old
              return {
                ...old,
                pages: old.pages.map((p) => ({
                  ...p,
                  messages: p.messages.map((m) => {
                    if (m.id !== parsed.messageId) return m
                    const reactions = [...(m.reactions ?? [])]
                    const idx = reactions.findIndex((r) => r.emoji === parsed.emoji)
                    const me = parsed.userId === useSessionStore().user?.id
                    if (parsed.op === 'add') {
                      if (idx === -1) reactions.push({ emoji: parsed.emoji, count: 1, me })
                      else {
                        reactions[idx] = { ...reactions[idx]!, count: reactions[idx]!.count + 1, me: reactions[idx]!.me || me }
                      }
                    }
                    else if (idx >= 0) {
                      const nextCount = reactions[idx]!.count - 1
                      if (nextCount <= 0) reactions.splice(idx, 1)
                      else reactions[idx] = { ...reactions[idx]!, count: nextCount, me: me ? false : reactions[idx]!.me }
                    }
                    return { ...m, reactions }
                  }),
                })),
              }
            })
            break
          }
          case 'pin': {
            const qc = queryClient()
            qc?.setQueryData<InfiniteData<Page>>(['messages', id], (old) => {
              if (!old) return old
              return {
                ...old,
                pages: old.pages.map(page => ({
                  ...page,
                  messages: page.messages.map(message => message.id === parsed.messageId
                    ? { ...message, pin: parsed.pin }
                    : message),
                })),
              }
            })
            void qc?.invalidateQueries({ queryKey: ['pins', id] })
            break
          }
          case 'read.ack':
            if (pendingRead && pendingRead.messageId <= parsed.messageId) pendingRead = null
            queryClient()?.setQueryData(['readCursor', parsed.channelId], parsed.messageId)
            applyReadAck(parsed.channelId, parsed.unread)
            break
          case 'error':
            if (parsed.code === 'realtimekit_unconfigured') useUiStore().huddleSetupOpen = true
            break
        }
      })
      socket.addEventListener('close', () => {
        authenticated = false
        if (ws === socket) ws = null
        if (!closed && gen === generation) {
          const delay = Math.min(12_000, 1500 * 2 ** attempt)
          attempt += 1
          setTimeout(() => { void connect(gen) }, delay)
        }
      })
    }
    catch {
      if (!closed && gen === generation) setTimeout(() => { void connect(gen) }, 3000)
    }
    finally {
      connecting = false
      if (!closed && gen !== generation) void connect(generation)
    }
  }

  function send(msg: ClientMsg) {
    if (msg.t === 'message.create') outstanding.set(msg.clientId, msg)
    if (msg.t === 'read' && (!pendingRead || pendingRead.messageId < msg.messageId)) pendingRead = msg
    if (authenticated && ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
      return
    }
    if (msg.t === 'typing' || msg.t === 'auth' || msg.t === 'message.create') return
    if (msg.t === 'read') return
    if (pending.length < 100) pending.push(msg)
  }

  function disconnect() {
    generation += 1
    closed = true
    authenticated = false
    pending.splice(0)
    pendingRead = null
    outstanding.clear()
    ws?.close()
    ws = null
  }

  watch(() => toValue(channelId), () => {
    generation += 1
    closed = false
    authenticated = false
    pending.splice(0)
    pendingRead = null
    outstanding.clear()
    ws?.close()
    ws = null
    void connect(generation)
  }, { immediate: true })

  onUnmounted(disconnect)

  return { send, connect, disconnect }
}
