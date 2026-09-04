import { decryptSecret } from '../shared/encrypted-secret'
import type { RealtimeKitSettingsAdminDTO } from '../shared/types'
import type { DiscoflareEnv } from './env'

export const REALTIMEKIT_SECRET_SCOPE = 'realtimekit-api-token'

export type RealtimeKitRuntimeConfig = {
  accountId: string
  appId: string
  apiKey: string
  apiSecret: string
  voicePreset: string
  avPreset: string
  source: 'deployment' | 'database' | 'missing'
  apiTokenConfigured: boolean
  secretReadable: boolean
}

type RealtimeKitSettingsRow = {
  account_id: string
  app_id: string
  api_token_ciphertext: string
  api_token_iv: string
  api_token_version: number
  voice_preset: string
  av_preset: string
}

function blankConfig(env: DiscoflareEnv): RealtimeKitRuntimeConfig {
  return {
    accountId: '',
    appId: '',
    apiKey: '',
    apiSecret: '',
    voicePreset: env.REALTIMEKIT_PRESET_VOICE?.trim() || 'voice',
    avPreset: env.REALTIMEKIT_PRESET_AV?.trim() || 'group_call_host',
    source: 'missing',
    apiTokenConfigured: false,
    secretReadable: true,
  }
}

export async function loadRealtimeKitConfig(env: DiscoflareEnv): Promise<RealtimeKitRuntimeConfig> {
  const accountId = env.REALTIMEKIT_ACCOUNT_ID?.trim() || ''
  const appId = env.REALTIMEKIT_APP_ID?.trim() || ''
  const apiKey = env.REALTIMEKIT_API_KEY?.trim() || ''
  const apiSecret = env.REALTIMEKIT_API_SECRET?.trim() || ''
  if (appId && apiKey && (accountId || apiSecret)) {
    return {
      accountId,
      appId,
      apiKey,
      apiSecret,
      voicePreset: env.REALTIMEKIT_PRESET_VOICE?.trim() || 'voice',
      avPreset: env.REALTIMEKIT_PRESET_AV?.trim() || env.REALTIMEKIT_PRESET_VOICE?.trim() || 'group_call_host',
      source: 'deployment',
      apiTokenConfigured: true,
      secretReadable: true,
    }
  }

  let row: RealtimeKitSettingsRow | null
  try {
    row = await env.DB.prepare(
      `SELECT account_id, app_id, api_token_ciphertext, api_token_iv, api_token_version,
              voice_preset, av_preset
       FROM realtimekit_settings WHERE id = 'main'`,
    ).first<RealtimeKitSettingsRow>()
  }
  catch {
    return blankConfig(env)
  }
  if (!row) return blankConfig(env)

  const config: RealtimeKitRuntimeConfig = {
    accountId: row.account_id.trim(),
    appId: row.app_id.trim(),
    apiKey: '',
    apiSecret: '',
    voicePreset: row.voice_preset.trim() || 'voice',
    avPreset: row.av_preset.trim() || row.voice_preset.trim() || 'group_call_host',
    source: 'database',
    apiTokenConfigured: Boolean(row.api_token_ciphertext),
    secretReadable: true,
  }
  const installationSecret = env.AUTH_SECRET?.trim()
  if (!installationSecret) {
    config.secretReadable = false
    return config
  }
  try {
    config.apiKey = await decryptSecret(installationSecret, REALTIMEKIT_SECRET_SCOPE, {
      ciphertext: row.api_token_ciphertext,
      iv: row.api_token_iv,
      version: row.api_token_version,
    })
  }
  catch {
    config.secretReadable = false
  }
  return config
}

export function realtimekitConfigured(config: RealtimeKitRuntimeConfig): boolean {
  return Boolean(config.appId && config.apiKey && (config.accountId || config.apiSecret))
}

export function realtimekitSettingsAdminDto(config: RealtimeKitRuntimeConfig): RealtimeKitSettingsAdminDTO {
  return {
    configured: realtimekitConfigured(config),
    source: config.source,
    accountId: config.accountId || null,
    appId: config.appId || null,
    apiTokenConfigured: config.apiTokenConfigured,
    secretReadable: config.secretReadable,
    voicePreset: config.voicePreset,
    avPreset: config.avPreset,
  }
}

type MeetingCreateResult = { id: string }
type ParticipantResult = { token: string }
export type RealtimeKitConnectionTestResult = { presets: string[] }

export async function testRealtimeKitConnection(config: RealtimeKitRuntimeConfig): Promise<RealtimeKitConnectionTestResult> {
  if (!realtimekitConfigured(config)) throw new Error('RealtimeKit credentials missing')
  const data = await kitFetch(config, 'GET', '/presets')
  const presets = pickPresetNames(data)
  const required = [...new Set([config.voicePreset, config.avPreset])]
  const missing = required.filter(name => !presets.includes(name))
  if (missing.length) throw new Error(`RealtimeKit preset not found: ${missing.join(', ')}`)
  return { presets }
}

export async function createMeeting(config: RealtimeKitRuntimeConfig, title: string): Promise<MeetingCreateResult> {
  const data = await kitFetch(config, 'POST', '/meetings', { title })
  const id = pickId(data)
  if (!id) throw new Error('RealtimeKit meeting create failed')
  return { id }
}

export async function addParticipant(
  config: RealtimeKitRuntimeConfig,
  meetingId: string,
  opts: { name: string, customId: string, preset?: string },
): Promise<ParticipantResult> {
  const preset = opts.preset || config.voicePreset || 'voice'
  const data = await kitFetch(config, 'POST', `/meetings/${meetingId}/participants`, {
    name: opts.name,
    preset_name: preset,
    custom_participant_id: opts.customId,
  })
  const token = pickToken(data)
  if (!token) throw new Error('RealtimeKit participant token missing')
  return { token }
}

export async function endMeeting(config: RealtimeKitRuntimeConfig, meetingId: string): Promise<void> {
  try {
    await kitFetch(config, 'PATCH', `/meetings/${meetingId}`, { status: 'INACTIVE' })
  }
  catch {
    // best-effort
  }
}

async function kitFetch(config: RealtimeKitRuntimeConfig, method: string, path: string, body?: unknown): Promise<unknown> {
  if (config.accountId && config.appId && config.apiKey) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/realtime/kit/${config.appId}${path}`
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const json = await res.json() as { success?: boolean, result?: unknown, data?: unknown }
    if (!res.ok) throw new Error(`RealtimeKit HTTP ${res.status}`)
    return json.result ?? json.data ?? json
  }

  if (config.apiKey && config.apiSecret) {
    const auth = btoa(`${config.apiKey}:${config.apiSecret}`)
    const url = `https://api.realtime.cloudflare.com/v2${path}`
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const json = await res.json() as { success?: boolean, data?: unknown }
    if (!res.ok) throw new Error(`RealtimeKit HTTP ${res.status}`)
    return json.data ?? json
  }

  throw new Error('RealtimeKit unconfigured')
}

function pickId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const rec = data as Record<string, unknown>
  if (typeof rec.id === 'string') return rec.id
  const inner = rec.data
  if (inner && typeof inner === 'object' && typeof (inner as { id?: unknown }).id === 'string') {
    return (inner as { id: string }).id
  }
  return null
}

function pickToken(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const rec = data as Record<string, unknown>
  if (typeof rec.token === 'string') return rec.token
  if (typeof rec.authToken === 'string') return rec.authToken
  const inner = rec.data
  if (inner && typeof inner === 'object') {
    const d = inner as Record<string, unknown>
    if (typeof d.token === 'string') return d.token
    if (typeof d.authToken === 'string') return d.authToken
  }
  return null
}

function pickPresetNames(data: unknown): string[] {
  const list = Array.isArray(data)
    ? data
    : (data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)
        ? (data as { data: unknown[] }).data
        : [])
  return list.flatMap((preset) => {
    if (!preset || typeof preset !== 'object') return []
    const name = (preset as { name?: unknown }).name
    return typeof name === 'string' ? [name] : []
  })
}
