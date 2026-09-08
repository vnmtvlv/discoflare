import type { HuddleState, ClientMsg } from '~~/shared/types'
import type { HuddleMeeting } from '../stores/huddle'

export type HuddleJoinOptions = {
  audio: boolean
  video: boolean
  audioInputId?: string
  videoInputId?: string
  audioOutputId?: string
  scheduleId?: string | null
  title?: string
  kind?: 'call' | 'huddle'
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export function useHuddleSession(
  channelId: MaybeRefOrGetter<string>,
  send: (msg: ClientMsg) => void,
  opts: { leaveOnUnmount?: boolean } = {},
) {
  const huddle = useHuddleStore()
  const ui = useUiStore()
  const health = computed(() => useSessionStore().health)

  async function notifyLeave(id: string) {
    try { await $fetch(`/api/huddles/${id}/leave`, { method: 'POST' }) }
    catch { /* provider leave is still authoritative for media */ }
  }

  async function hangupLocal(notify = true) {
    const id = huddle.currentChannelId
    const meeting = huddle.meeting
    try { await meeting?.leave() }
    catch { /* already disconnected */ }
    huddle.clearMeeting()
    if (notify && id) await notifyLeave(id)
  }

  async function participantToken(id: string) {
    let lastError: unknown
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        return await $fetch<{ token: string; meetingId: string; huddle: HuddleState }>(`/api/huddles/${id}/token`, { method: 'POST' })
      }
      catch (error) {
        lastError = error
        const status = (error as { statusCode?: number; status?: number; response?: { status?: number } }).statusCode
          ?? (error as { status?: number }).status
          ?? (error as { response?: { status?: number } }).response?.status
        if (status !== 404 || attempt === 19) throw error
        await wait(Math.min(1000, 200 + attempt * 100))
      }
    }
    throw lastError
  }

  async function join(options: HuddleJoinOptions) {
    const id = toValue(channelId)
    if (huddle.connection === 'live' && huddle.currentChannelId === id) return
    if (huddle.meeting) await hangupLocal()
    huddle.connection = 'connecting'
    huddle.error = null
    let activeMeeting: HuddleMeeting | null = null
    try {
      const response = await participantToken(id)
      const RealtimeKitClient = (await import('@cloudflare/realtimekit')).default
      const meeting = await RealtimeKitClient.init({
        authToken: response.token,
        defaults: { audio: options.audio, video: options.video },
      }) as unknown as HuddleMeeting
      activeMeeting = meeting
      await meeting.join()
      send({ t: 'huddle.join' })
      huddle.setState(id, response.huddle)
      huddle.attachMeeting(meeting, {
        channelId: id,
        title: response.huddle.title || options.title || (response.huddle.kind === 'call' ? 'Call' : 'Huddle'),
        kind: response.huddle.kind,
      })
      huddle.muted = !options.audio
      huddle.camera = options.video
      huddle.screenSharing = false
      await Promise.allSettled([
        ...(options.audioInputId ? [huddle.setDevice('audioinput', options.audioInputId)] : []),
        ...(options.videoInputId ? [huddle.setDevice('videoinput', options.videoInputId)] : []),
        ...(options.audioOutputId ? [huddle.setDevice('audiooutput', options.audioOutputId)] : []),
      ])
      try { await meeting.audio.play() }
      catch { /* browser may require another gesture; media controls remain available */ }
      huddle.connection = 'live'
      huddle.startHeartbeat()
      huddle.expanded = true
    }
    catch (err) {
      try { await activeMeeting?.leave() }
      catch { /* initialization may have failed before joining */ }
      await notifyLeave(id)
      huddle.clearMeeting()
      huddle.connection = 'error'
      const code = (err as { data?: { error?: { code?: string } } })?.data?.error?.code
      if (code === 'realtimekit_unconfigured') ui.huddleSetupOpen = true
      huddle.error = errorMessage(err)
      throw err
    }
  }

  async function start(options: HuddleJoinOptions) {
    if (health.value && !health.value.realtimekit) {
      ui.huddleSetupOpen = true
      return
    }
    send({ t: 'huddle.start', ...(options.scheduleId ? { scheduleId: options.scheduleId } : {}) })
    await join(options)
  }

  async function leave() {
    await hangupLocal()
  }

  if (opts.leaveOnUnmount !== false) {
    onUnmounted(() => {
      if (huddle.connection === 'live') void hangupLocal()
    })
  }

  return {
    start,
    join,
    leave,
    toggleMute: huddle.toggleMute,
    toggleCamera: huddle.toggleCamera,
    toggleScreenShare: huddle.toggleScreenShare,
  }
}
