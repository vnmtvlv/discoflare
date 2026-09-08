import type { PresetCreateParams } from 'cloudflare/resources/realtime-kit/presets'
import { cloudflareClient } from './cloudflare-client.js'
import { createError } from './errors.js'

export const realtimeKitCapability = 'managed-realtimekit-v1'
export const realtimeKitVoicePreset = 'discoflare_voice'
export const realtimeKitAvPreset = 'discoflare_huddle'

export type ManagedRealtimeKit = {
  accountId: string
  appId: string
  apiToken?: string
  voicePreset: string
  avPreset: string
  managed: boolean
}

export function realtimeKitAppName(workerName: string) {
  return `Discoflare · ${workerName}`
}

export function realtimeKitPreset(name: string, video: boolean): PresetCreateParams {
  return {
    account_id: '',
    name,
    config: {
      view_type: video ? 'GROUP_CALL' : 'AUDIO_ROOM',
      max_screenshare_count: video ? 1 : 0,
      max_video_streams: { desktop: video ? 9 : 0, mobile: video ? 4 : 0 },
      media: {
        audio: { enable_high_bitrate: false, enable_stereo: false },
        video: { frame_rate: 30, quality: 'hd', simulcast: true },
        screenshare: { frame_rate: 15, quality: 'hd' },
      },
    },
    permissions: {
      accept_waiting_requests: false,
      can_accept_production_requests: false,
      can_change_participant_permissions: false,
      can_edit_display_name: false,
      can_livestream: false,
      can_record: false,
      can_spotlight: false,
      chat: {
        private: { can_receive: false, can_send: false, files: false, text: false },
        public: { can_send: false, files: false, text: false },
      },
      connected_meetings: {
        can_alter_connected_meetings: false,
        can_switch_connected_meetings: false,
        can_switch_to_parent_meeting: false,
      },
      disable_participant_audio: false,
      disable_participant_screensharing: false,
      disable_participant_video: false,
      hidden_participant: false,
      kick_participant: false,
      media: {
        audio: { can_produce: 'ALLOWED' },
        screenshare: { can_produce: video ? 'ALLOWED' : 'NOT_ALLOWED' },
        video: { can_produce: video ? 'ALLOWED' : 'NOT_ALLOWED' },
      },
      pin_participant: false,
      plugins: { can_close: false, can_edit_config: false, can_start: false, config: {} },
      polls: { can_create: false, can_view: false, can_vote: false },
      recorder_type: 'NONE',
      show_participant_list: true,
      waiting_room_type: 'SKIP',
      accept_stage_requests: false,
      is_recorder: false,
      stage_access: 'NOT_ALLOWED',
      stage_enabled: false,
      transcription_enabled: false,
    },
    ui: {
      design_tokens: {
        border_radius: 'rounded',
        border_width: 'thin',
        spacing_base: 4,
        theme: 'darkest',
        colors: {
          background: {
            '600': '#293241',
            '700': '#202938',
            '800': '#18202d',
            '900': '#111827',
            '1000': '#080d16',
          },
          brand: {
            '300': '#93c5fd',
            '400': '#60a5fa',
            '500': '#3b82f6',
            '600': '#2563eb',
            '700': '#1d4ed8',
          },
          danger: '#ef4444',
          success: '#22c55e',
          text: '#f8fafc',
          text_on_brand: '#ffffff',
          video_bg: '#020617',
          warning: '#f59e0b',
        },
      },
    },
  }
}

async function ensureApp(client: ReturnType<typeof cloudflareClient>, accountId: string, workerName: string, existingAppId?: string) {
  if (existingAppId) return existingAppId
  const name = realtimeKitAppName(workerName)
  const response = await client.realtimeKit.apps.get({ account_id: accountId, search: name, per_page: 100 })
  const exact = (response.data || []).filter(app => app.name === name && app.id)
  if (exact.length > 1) {
    throw createError({ statusCode: 409, statusMessage: `More than one RealtimeKit app is named ${name}` })
  }
  if (exact[0]?.id) return exact[0].id
  const created = await client.realtimeKit.apps.post({ account_id: accountId, name })
  const appId = created.data?.app?.id
  if (!appId) throw createError({ statusCode: 502, statusMessage: 'Cloudflare did not return the RealtimeKit app ID' })
  return appId
}

async function ensurePresets(client: ReturnType<typeof cloudflareClient>, accountId: string, appId: string) {
  const response = await client.realtimeKit.presets.get(appId, { account_id: accountId })
  const names = new Set((response.data || []).map(preset => preset.name).filter(Boolean))
  for (const [name, video] of [[realtimeKitVoicePreset, false], [realtimeKitAvPreset, true]] as const) {
    if (names.has(name)) continue
    const preset = realtimeKitPreset(name, video)
    await client.realtimeKit.presets.create(appId, { ...preset, account_id: accountId })
  }
}

async function verifyRuntimeToken(apiToken: string, accountId: string, appId: string) {
  const client = cloudflareClient(apiToken)
  const presets = await client.realtimeKit.presets.get(appId, { account_id: accountId })
  const names = new Set((presets.data || []).map(preset => preset.name))
  if (!names.has(realtimeKitVoicePreset) || !names.has(realtimeKitAvPreset)) {
    throw createError({ statusCode: 502, statusMessage: 'The RealtimeKit runtime token cannot read the managed presets' })
  }

  const meeting = await client.realtimeKit.meetings.create(appId, {
    account_id: accountId,
    title: 'Discoflare installation check',
    persist_chat: false,
    record_on_start: false,
    live_stream_on_start: false,
    summarize_on_end: false,
    transcribe_on_end: false,
  })
  const meetingId = meeting.data?.id
  if (!meetingId) throw createError({ statusCode: 502, statusMessage: 'RealtimeKit meeting verification did not return an ID' })
  try {
    const participant = await client.realtimeKit.meetings.addParticipant(meetingId, {
      account_id: accountId,
      app_id: appId,
      custom_participant_id: `installer-${crypto.randomUUID()}`,
      name: 'Discoflare installer',
      preset_name: realtimeKitAvPreset,
    })
    if (!participant.data?.token) throw createError({ statusCode: 502, statusMessage: 'RealtimeKit participant verification did not return a token' })
  }
  finally {
    await client.realtimeKit.meetings.updateMeetingByID(meetingId, {
      account_id: accountId,
      app_id: appId,
      status: 'INACTIVE',
    }).catch(() => undefined)
  }
}

export async function ensureManagedRealtimeKit(
  apiToken: string,
  accountId: string,
  workerName: string,
  existing: { appId?: string } = {},
): Promise<ManagedRealtimeKit> {
  const client = cloudflareClient(apiToken)
  const appId = await ensureApp(client, accountId, workerName, existing.appId)
  await ensurePresets(client, accountId, appId)
  await verifyRuntimeToken(apiToken, accountId, appId)
  return {
    accountId,
    appId,
    apiToken,
    voicePreset: realtimeKitVoicePreset,
    avPreset: realtimeKitAvPreset,
    managed: true,
  }
}
