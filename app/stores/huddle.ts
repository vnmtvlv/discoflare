import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import type { RTKParticipant, RTKSelf } from '@cloudflare/realtimekit'
import type { HuddleState } from '~~/shared/types'
import type { WorkspaceHuddleChangedEvent, WorkspaceHuddleScheduleEvent } from '~~/shared/workspace-realtime'

type Conn = 'idle' | 'connecting' | 'live' | 'error'

type MeetingEventSource = {
  on: (event: string, callback: (...args: unknown[]) => void) => unknown
  off: (event: string, callback: (...args: unknown[]) => void) => unknown
}

export type HuddleMeeting = {
  join: () => Promise<void>
  leave: () => Promise<void>
  self: RTKSelf
  participants: {
    joined: MeetingEventSource & { toArray: () => RTKParticipant[] }
    on: (event: string, callback: (...args: unknown[]) => void) => unknown
    off: (event: string, callback: (...args: unknown[]) => void) => unknown
  }
  audio: { setSpeakerDevice: (deviceId: string) => void; play: () => Promise<void> }
}

export type IncomingHuddle = {
  channelId: string
  title: string
  body: string
  kind: 'call' | 'huddle'
  scheduleId: string | null
  active: boolean
}

export const useHuddleStore = defineStore('huddle', () => {
  const states = ref<Record<string, HuddleState>>({})
  const viewingChannelId = ref('')
  const state = computed(() => states.value[viewingChannelId.value] ?? null)
  const currentChannelId = ref<string | null>(null)
  const currentTitle = ref<string | null>(null)
  const currentKind = ref<'call' | 'huddle'>('huddle')
  const muted = ref(false)
  const deafened = ref(false)
  const camera = ref(false)
  const screenSharing = ref(false)
  const expanded = ref(true)
  const connection = ref<Conn>('idle')
  const error = ref<string | null>(null)
  const meeting = shallowRef<HuddleMeeting | null>(null)
  const selfParticipant = shallowRef<RTKSelf | null>(null)
  const remoteParticipants = shallowRef<RTKParticipant[]>([])
  const activeSpeakerId = ref<string | null>(null)
  const mediaRevision = ref(0)
  const incoming = ref<IncomingHuddle | null>(null)
  const pendingJoin = ref<{ channelId: string; scheduleId: string | null; start: boolean } | null>(null)
  let cleanupMeetingEvents: (() => void) | null = null
  let cleanupParticipantEvents: (() => void) | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null

  function view(channelId: string) {
    viewingChannelId.value = channelId
  }

  function stateFor(channelId: string): HuddleState | null {
    return states.value[channelId] ?? null
  }

  function setState(channelId: string, next: HuddleState | null) {
    if (!channelId) return
    if (next) states.value = { ...states.value, [channelId]: next }
    else {
      const { [channelId]: _removed, ...rest } = states.value
      states.value = rest
    }
    if (next && !next.active && incoming.value?.channelId === channelId) incoming.value = null
  }

  function syncParticipants() {
    const active = meeting.value
    selfParticipant.value = active?.self ? markRaw(active.self) : null
    remoteParticipants.value = (active?.participants.joined.toArray() ?? []).map(participant => markRaw(participant))
    cleanupParticipantEvents?.()
    const eventSources = remoteParticipants.value.map(participant => participant as unknown as MeetingEventSource)
    const updateMedia = () => { mediaRevision.value += 1 }
    for (const source of eventSources) {
      source.on('videoUpdate', updateMedia)
      source.on('audioUpdate', updateMedia)
      source.on('screenShareUpdate', updateMedia)
    }
    cleanupParticipantEvents = () => {
      for (const source of eventSources) {
        source.off('videoUpdate', updateMedia)
        source.off('audioUpdate', updateMedia)
        source.off('screenShareUpdate', updateMedia)
      }
    }
    mediaRevision.value += 1
  }

  function attachMeeting(next: HuddleMeeting, context: { channelId: string; title: string; kind: 'call' | 'huddle' }) {
    cleanupMeetingEvents?.()
    meeting.value = markRaw(next)
    currentChannelId.value = context.channelId
    currentTitle.value = context.title
    currentKind.value = context.kind
    const joined = next.participants.joined
    const participants = next.participants
    const self = next.self as unknown as MeetingEventSource
    const sync = () => syncParticipants()
    const onSpeaker = (...args: unknown[]) => {
      const payload = args[0] as { peerId?: string } | undefined
      activeSpeakerId.value = payload?.peerId ?? null
    }
    const onRoomLeft = () => {
      if (meeting.value !== next) return
      connection.value = 'error'
      error.value = 'The live connection ended. Leave and join again to reconnect.'
    }
    const joinedEvents = ['participantJoined', 'participantLeft', 'participantsUpdate', 'participantsCleared']
    const selfEvents = ['videoUpdate', 'audioUpdate', 'screenShareUpdate', 'deviceUpdate', 'roomLeft']
    for (const event of joinedEvents) joined.on(event, sync)
    for (const event of selfEvents) self.on(event, sync)
    self.on('roomLeft', onRoomLeft)
    participants.on('activeSpeaker', onSpeaker)
    cleanupMeetingEvents = () => {
      for (const event of joinedEvents) joined.off(event, sync)
      for (const event of selfEvents) self.off(event, sync)
      self.off('roomLeft', onRoomLeft)
      participants.off('activeSpeaker', onSpeaker)
    }
    syncParticipants()
  }

  function clearMeeting() {
    cleanupMeetingEvents?.()
    cleanupMeetingEvents = null
    cleanupParticipantEvents?.()
    cleanupParticipantEvents = null
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    heartbeatTimer = null
    meeting.value = null
    selfParticipant.value = null
    remoteParticipants.value = []
    activeSpeakerId.value = null
    currentChannelId.value = null
    currentTitle.value = null
    muted.value = false
    deafened.value = false
    camera.value = false
    screenSharing.value = false
    connection.value = 'idle'
    mediaRevision.value += 1
  }

  function startHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    const heartbeat = async () => {
      if (!currentChannelId.value || connection.value !== 'live') return
      try { await $fetch(`/api/huddles/${currentChannelId.value}/heartbeat`, { method: 'POST' }) }
      catch { /* the DO expiry removes stale presence when connectivity does not recover */ }
    }
    heartbeatTimer = setInterval(() => { void heartbeat() }, 15_000)
    void heartbeat()
  }

  async function applyMute(next: boolean) {
    try {
      if (meeting.value?.self) {
        if (next) await meeting.value.self.disableAudio()
        else await meeting.value.self.enableAudio()
      }
      muted.value = next
      error.value = null
      syncParticipants()
    }
    catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Microphone control failed'
    }
  }

  async function toggleMute() {
    if (deafened.value && muted.value) return
    await applyMute(!muted.value)
  }

  async function toggleDeafen() {
    const next = !deafened.value
    deafened.value = next
    for (const participant of remoteParticipants.value) {
      if (participant.audioTrack) participant.audioTrack.enabled = !next
    }
    if (next) await applyMute(true)
  }

  async function toggleCamera() {
    if (!meeting.value?.self) return
    try {
      if (camera.value) await meeting.value.self.disableVideo()
      else await meeting.value.self.enableVideo()
      camera.value = !camera.value
      error.value = null
      syncParticipants()
    }
    catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Camera control failed'
    }
  }

  async function toggleScreenShare() {
    if (!meeting.value?.self) return
    try {
      if (screenSharing.value) await meeting.value.self.disableScreenShare()
      else await meeting.value.self.enableScreenShare()
      screenSharing.value = !screenSharing.value
      error.value = null
      syncParticipants()
    }
    catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Screen sharing failed'
    }
  }

  async function setDevice(kind: MediaDeviceKind, deviceId: string) {
    if (!meeting.value || !deviceId) return
    if (kind === 'audiooutput') {
      meeting.value.audio.setSpeakerDevice(deviceId)
      return
    }
    const devices = await meeting.value.self.getAllDevices()
    const device = devices.find(item => item.deviceId === deviceId && item.kind === kind)
    if (device) await meeting.value.self.setDevice(device)
  }

  function receiveHuddle(event: WorkspaceHuddleChangedEvent) {
    setState(event.channelId, event.huddle)
    if (!event.huddle.active || currentChannelId.value === event.channelId || !event.ring) return
    incoming.value = {
      channelId: event.channelId,
      title: event.notification.title,
      body: event.notification.body,
      kind: event.huddle.kind,
      scheduleId: event.huddle.scheduleId,
      active: true,
    }
  }

  function receiveSchedule(event: WorkspaceHuddleScheduleEvent) {
    if (!event.ring || currentChannelId.value === event.channelId) return
    incoming.value = {
      channelId: event.channelId,
      title: event.notification.title,
      body: event.notification.body,
      kind: 'call',
      scheduleId: event.schedule.id,
      active: false,
    }
  }

  function answerIncoming() {
    if (!incoming.value) return
    pendingJoin.value = {
      channelId: incoming.value.channelId,
      scheduleId: incoming.value.scheduleId,
      start: !incoming.value.active,
    }
    const channelId = incoming.value.channelId
    incoming.value = null
    void navigateTo(`/channels/${channelId}`)
  }

  return {
    states,
    state,
    viewingChannelId,
    currentChannelId,
    currentTitle,
    currentKind,
    muted,
    deafened,
    camera,
    screenSharing,
    expanded,
    connection,
    error,
    meeting,
    selfParticipant,
    remoteParticipants,
    activeSpeakerId,
    mediaRevision,
    incoming,
    pendingJoin,
    view,
    stateFor,
    setState,
    attachMeeting,
    clearMeeting,
    startHeartbeat,
    syncParticipants,
    applyMute,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    toggleScreenShare,
    setDevice,
    receiveHuddle,
    receiveSchedule,
    answerIncoming,
  }
})
