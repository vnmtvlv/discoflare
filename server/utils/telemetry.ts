import type { TelemetryHeartbeat } from '../../shared/telemetry'
import { agentComputerConfigured, type DiscoflareEnv } from '../../workers/env'
import { workspaceEmailAvailable } from '../../workers/mail-transport'

const DEFAULT_ENDPOINT = 'https://discoflare.com/api/telemetry/heartbeat'

export async function telemetryEnabled(db: D1Database): Promise<boolean> {
  try {
    const row = await db.prepare("SELECT enabled FROM telemetry_settings WHERE id = 'main'").first<{ enabled: number | boolean }>()
    return row?.enabled === true || row?.enabled === 1
  }
  catch {
    // A release should never report before its telemetry migration has applied.
    return false
  }
}

export function telemetryHeartbeat(env: DiscoflareEnv, sentAt = new Date().toISOString()): TelemetryHeartbeat | null {
  const installationId = env.DISCOFLARE_TELEMETRY_ID?.trim()
  const version = env.DISCOFLARE_VERSION?.trim()
  if (!installationId || !version || !env.DISCOFLARE_TELEMETRY_TOKEN) return null

  return {
    schemaVersion: 1,
    installationId,
    version,
    sentAt,
    capabilities: {
      d1: Boolean(env.DB),
      r2: Boolean(env.FILES),
      kv: Boolean(env.TICKETS),
      customDomain: Boolean(env.DISCOFLARE_APP_HOSTNAME),
      email: Boolean(env.MAIL_DOMAIN && (workspaceEmailAvailable(env) || env.EMAIL)),
      agents: agentComputerConfigured(env) && Boolean(env.AI && env.AGENT_DO),
      huddles: Boolean(env.REALTIMEKIT_ACCOUNT_ID && env.REALTIMEKIT_APP_ID && (env.REALTIMEKIT_API_KEY || env.DISCOFLARE_ADMIN_TOKEN || env.DISCOFLARE_ADMIN)),
    },
  }
}

export async function sendTelemetryHeartbeat(
  env: DiscoflareEnv,
  fetcher: typeof fetch = fetch,
): Promise<'sent' | 'disabled' | 'unavailable'> {
  const heartbeat = telemetryHeartbeat(env)
  if (!heartbeat) return 'unavailable'
  if (!await telemetryEnabled(env.DB)) return 'disabled'

  const response = await fetcher(env.DISCOFLARE_TELEMETRY_ENDPOINT?.trim() || DEFAULT_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.DISCOFLARE_TELEMETRY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(heartbeat),
  })
  if (!response.ok) throw new Error(`Telemetry heartbeat returned ${response.status}`)
  return 'sent'
}
