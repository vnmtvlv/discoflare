import type { ClientMsg } from '~~/shared/types'

export function useHuddleSession(
  channelId: MaybeRefOrGetter<string>,
  send: (msg: ClientMsg) => void,
  opts: { leaveOnUnmount?: boolean } = {},
) {
  const huddle = useHuddleStore()
  const ui = useUiStore()
  const health = computed(() => useSessionStore().health)

  async function hangupLocal() {
    const meeting = huddle.meeting as { leave?: () => Promise<void> } | null
    try { await meeting?.leave?.() }
    catch { /* ignore */ }
    huddle.meeting = null
    huddle.connection = 'idle'
  }

  async function start() {
    if (health.value && !health.value.realtimekit) {
      ui.huddleSetupOpen = true
      return
    }
    send({ t: 'huddle.start' })
    setTimeout(() => { void join() }, 400)
  }

  async function join() {
    huddle.connection = 'connecting'
    huddle.error = null
    try {
      send({ t: 'huddle.join' })
      const { token } = await $fetch<{ token: string }>(`/api/voice/${toValue(channelId)}/token`, { method: 'POST' })
      const RealtimeKitClient = (await import('@cloudflare/realtimekit')).default
      const meeting = await RealtimeKitClient.init({
        authToken: token,
        defaults: { audio: true, video: false },
      })
      huddle.meeting = meeting
      await meeting.join()
      await meeting.self.enableAudio()
      huddle.muted = false
      huddle.connection = 'live'
    }
    catch (err) {
      huddle.connection = 'error'
      const code = (err as { data?: { error?: { code?: string } } })?.data?.error?.code
      if (code === 'realtimekit_unconfigured') ui.huddleSetupOpen = true
      huddle.error = errorMessage(err)
    }
  }

  async function leave() {
    await hangupLocal()
    send({ t: 'huddle.leave' })
  }

  async function toggleMute() {
    await huddle.toggleMute()
  }

  if (opts.leaveOnUnmount !== false) {
    watch(() => toValue(channelId), (id, prev) => {
      if (prev && id !== prev && huddle.connection === 'live') void hangupLocal()
    })
    onUnmounted(() => {
      if (huddle.connection === 'live') void hangupLocal()
    })
  }

  return { start, join, leave, toggleMute }
}
