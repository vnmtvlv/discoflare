import type { QueryClient } from '@tanstack/vue-query'
import type { WorkspaceServerMsg } from '~~/shared/types'
import type { WorkspaceRealtimeEvent } from '~~/shared/workspace-realtime'
import { applyWorkspaceRealtimeEvent } from '../utils/workspace-realtime'

export function useWorkspaceSocket(workspaceId: MaybeRefOrGetter<string>) {
  const { api, socketUrl } = useApi()
  const presence = usePresenceStore()
  const nuxt = useNuxtApp()
  let ws: WebSocket | null = null
  let closed = false
  let connecting = false
  let attempt = 0
  let generation = 0
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let lastActivity = 0

  function queryClient(): QueryClient | undefined {
    return nuxt.$queryClient as QueryClient | undefined
  }

  function sendActivity() {
    if (!import.meta.client || document.hidden || Date.now() - lastActivity < 10_000) return
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ t: 'activity' }))
      lastActivity = Date.now()
    }
  }

  async function connect(gen = generation) {
    const id = toValue(workspaceId)
    if (!id || !import.meta.client || connecting || closed) return
    connecting = true
    try {
      const { token } = await api<{ token: string }>('/api/auth/ws-token', { method: 'POST' })
      if (closed || gen !== generation) return
      const socket = new WebSocket(socketUrl(`/ws/workspace/${id}`))
      ws = socket
      socket.addEventListener('open', () => {
        if (gen !== generation) return socket.close()
        attempt = 0
        socket.send(JSON.stringify({ t: 'auth', token }))
      })
      socket.addEventListener('message', (ev) => {
        if (typeof ev.data !== 'string' || ev.data === 'pong') return
        let parsed: WorkspaceServerMsg | WorkspaceRealtimeEvent
        try { parsed = JSON.parse(ev.data) as WorkspaceServerMsg | WorkspaceRealtimeEvent }
        catch { return }
        if (parsed.t === 'presence') presence.apply(parsed.users)
        else if (parsed.t === 'channel.activity' || parsed.t === 'channel.read') {
          const qc = queryClient()
          if (qc) applyWorkspaceRealtimeEvent(qc, parsed)
        }
      })
      socket.addEventListener('close', () => {
        if (ws === socket) ws = null
        if (!closed && gen === generation) {
          const delay = Math.min(12_000, 2000 * 2 ** attempt)
          attempt += 1
          setTimeout(() => { void connect(gen) }, delay)
        }
      })
    }
    catch {
      if (!closed && gen === generation) setTimeout(() => { void connect(gen) }, 4000)
    }
    finally {
      connecting = false
      if (!closed && gen !== generation) void connect(generation)
    }
  }

  function disconnect() {
    generation += 1
    closed = true
    ws?.close()
    ws = null
  }

  watch(() => toValue(workspaceId), () => {
    generation += 1
    closed = false
    ws?.close()
    ws = null
    void connect(generation)
  }, { immediate: true })

  const activity = () => sendActivity()
  onMounted(() => {
    window.addEventListener('pointerdown', activity, { passive: true })
    window.addEventListener('keydown', activity)
    window.addEventListener('focus', activity)
    document.addEventListener('visibilitychange', activity)
    heartbeat = setInterval(sendActivity, 60_000)
  })

  onUnmounted(() => {
    window.removeEventListener('pointerdown', activity)
    window.removeEventListener('keydown', activity)
    window.removeEventListener('focus', activity)
    document.removeEventListener('visibilitychange', activity)
    if (heartbeat) clearInterval(heartbeat)
    disconnect()
  })
}
