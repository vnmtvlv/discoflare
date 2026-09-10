import { sendStream, setResponseHeaders } from 'h3'
import { cf, fail } from '../../../../utils/cf'
import { requireMember } from '../../../../utils/guards'

export default defineEventHandler(async (event) => {
  const workspaceId = getRouterParam(event, 'id')!
  const member = await requireMember(event, workspaceId)
  if (!member.isOwner) fail(403, 'forbidden', 'Only the owner can manage this installation')
  const body = await readBody<{ capability?: unknown, zoneId?: unknown, zoneName?: unknown, appSubdomain?: unknown, emailEnabled?: unknown }>(event)
  const capability = body?.capability === 'agent-computer' || body?.capability === 'huddles' || body?.capability === 'domain'
    ? body.capability
    : null
  if (!capability) fail(400, 'invalid_capability', 'Capability is invalid')

  const { env } = cf(event)
  const accountId = env.DISCOFLARE_ACCOUNT_ID?.trim() || ''
  const workerName = env.DISCOFLARE_WORKER_NAME?.trim() || ''
  const bearer = env.DISCOFLARE_ADMIN_CAPABILITY?.trim() || ''
  if (env.DISCOFLARE_MANAGEMENT_MODE !== 'admin' || !env.DISCOFLARE_ADMIN || !accountId || !workerName || !bearer) {
    fail(409, 'admin_unavailable', 'This installation is not connected to Discoflare Admin')
  }

  const response = await env.DISCOFLARE_ADMIN.fetch('https://discoflare-admin.internal/api/internal/capabilities', {
    method: 'POST',
    headers: {
      Accept: 'application/x-ndjson',
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      accountId,
      workerName,
      capability,
      zoneId: body.zoneId,
      zoneName: body.zoneName,
      appSubdomain: body.appSubdomain,
      emailEnabled: body.emailEnabled,
    }),
  })
  if (!response.ok) {
    const failure = await response.json().catch(() => null) as { statusMessage?: string } | null
    fail(response.status, 'capability_failed', failure?.statusMessage || 'Discoflare Admin could not enable this capability')
  }
  if (!response.body) fail(502, 'capability_failed', 'Discoflare Admin returned no deployment stream')

  setResponseHeaders(event, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    'X-Accel-Buffering': 'no',
  })
  return sendStream(event, response.body)
})
