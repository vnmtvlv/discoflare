import type { DiscoflareEnv } from './env'

export function realtimekitConfigured(env: DiscoflareEnv): boolean {
  return Boolean(env.REALTIMEKIT_APP_ID && env.REALTIMEKIT_API_KEY && (env.REALTIMEKIT_ACCOUNT_ID || env.REALTIMEKIT_API_SECRET))
}

type MeetingCreateResult = { id: string }
type ParticipantResult = { token: string }

export async function createMeeting(env: DiscoflareEnv, title: string): Promise<MeetingCreateResult> {
  const data = await kitFetch(env, 'POST', '/meetings', { title })
  const id = pickId(data)
  if (!id) throw new Error('RealtimeKit meeting create failed')
  return { id }
}

export async function addParticipant(
  env: DiscoflareEnv,
  meetingId: string,
  opts: { name: string; customId: string; preset?: string },
): Promise<ParticipantResult> {
  const preset = opts.preset || env.REALTIMEKIT_PRESET_VOICE || 'voice'
  const data = await kitFetch(env, 'POST', `/meetings/${meetingId}/participants`, {
    name: opts.name,
    preset_name: preset,
    custom_participant_id: opts.customId,
  })
  const token = pickToken(data)
  if (!token) throw new Error('RealtimeKit participant token missing')
  return { token }
}

export async function endMeeting(env: DiscoflareEnv, meetingId: string): Promise<void> {
  try {
    await kitFetch(env, 'PATCH', `/meetings/${meetingId}`, { status: 'INACTIVE' })
  }
  catch {
    // best-effort
  }
}

async function kitFetch(env: DiscoflareEnv, method: string, path: string, body?: unknown): Promise<unknown> {
  if (env.REALTIMEKIT_ACCOUNT_ID && env.REALTIMEKIT_APP_ID && env.REALTIMEKIT_API_KEY) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${env.REALTIMEKIT_ACCOUNT_ID}/realtime/kit/${env.REALTIMEKIT_APP_ID}${path}`
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${env.REALTIMEKIT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const json = await res.json() as { success?: boolean; result?: unknown; data?: unknown }
    if (!res.ok) throw new Error(`RealtimeKit HTTP ${res.status}`)
    return json.result ?? json.data ?? json
  }

  if (env.REALTIMEKIT_API_KEY && env.REALTIMEKIT_API_SECRET) {
    const auth = btoa(`${env.REALTIMEKIT_API_KEY}:${env.REALTIMEKIT_API_SECRET}`)
    const url = `https://api.realtime.cloudflare.com/v2${path}`
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const json = await res.json() as { success?: boolean; data?: unknown }
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
