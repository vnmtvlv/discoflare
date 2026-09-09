import type { InstallationHeartbeat } from '../../../shared/telemetry'
import { acceptHeartbeat, telemetryDatabase } from '../../utils/telemetry-registry'

function parseHeartbeat(value: unknown): InstallationHeartbeat {
  const body = value as Partial<InstallationHeartbeat> | null
  const capabilities = body?.capabilities
  if (!body || body.schemaVersion !== 1 || typeof capabilities !== 'object' || !capabilities) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid telemetry heartbeat' })
  }
  const installationId = String(body.installationId || '').trim()
  const version = String(body.version || '').trim()
  const sentAt = String(body.sentAt || '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(installationId) || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version) || Number.isNaN(Date.parse(sentAt))) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid telemetry heartbeat' })
  }
  const flags = ['d1', 'r2', 'kv', 'customDomain', 'email', 'agents', 'huddles'] as const
  if (flags.some(flag => typeof capabilities[flag] !== 'boolean')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid telemetry capabilities' })
  }
  return { schemaVersion: 1, installationId, version, sentAt, capabilities: capabilities as InstallationHeartbeat['capabilities'] }
}

export default defineEventHandler(async (event) => {
  const contentLength = Number(getHeader(event, 'content-length') || 0)
  if (contentLength > 4096) throw createError({ statusCode: 413, statusMessage: 'Heartbeat is too large' })
  const authorization = getHeader(event, 'authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (token.length < 32 || token.length > 256) throw createError({ statusCode: 401, statusMessage: 'Invalid telemetry credential' })
  const db = telemetryDatabase(event)
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Telemetry is unavailable' })
  const accepted = await acceptHeartbeat(db, token, parseHeartbeat(await readBody(event)))
  if (!accepted) throw createError({ statusCode: 401, statusMessage: 'Invalid telemetry credential' })
  setResponseStatus(event, 204)
  return null
})
