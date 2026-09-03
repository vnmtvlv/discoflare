import type { GuildServerMsg } from '~~/shared/types'

export function useGuildSocket(guildId: MaybeRefOrGetter<string>) {
  const presence = usePresenceStore()
  let ws: WebSocket | null = null
  let closed = false
  let connecting = false
  let attempt = 0

  async function connect() {
    const id = toValue(guildId)
    if (!id || !import.meta.client || connecting || closed) return
    connecting = true
    try {
      const { token } = await $fetch<{ token: string }>('/api/auth/ws-token', { method: 'POST' })
      if (closed) return
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/ws/guild/${id}`)
      ws.addEventListener('open', () => {
        attempt = 0
        ws?.send(JSON.stringify({ t: 'auth', token }))
      })
      ws.addEventListener('message', (ev) => {
        if (typeof ev.data !== 'string' || ev.data === 'pong') return
        let parsed: GuildServerMsg
        try { parsed = JSON.parse(ev.data) as GuildServerMsg }
        catch { return }
        if (parsed.t === 'presence') presence.apply(parsed.users)
      })
      ws.addEventListener('close', () => {
        ws = null
        if (!closed) {
          const delay = Math.min(12_000, 2000 * 2 ** attempt)
          attempt += 1
          setTimeout(() => { void connect() }, delay)
        }
      })
    }
    catch {
      if (!closed) setTimeout(() => { void connect() }, 4000)
    }
    finally {
      connecting = false
    }
  }

  function disconnect() {
    closed = true
    ws?.close()
    ws = null
  }

  watch(() => toValue(guildId), () => {
    disconnect()
    void connect()
  }, { immediate: true })

  onUnmounted(disconnect)
}
