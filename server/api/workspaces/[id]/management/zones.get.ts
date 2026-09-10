import type { CloudflareZone } from '../../../../../packages/installer-core/src/types'
import { cf, fail } from '../../../../utils/cf'
import { requireMember } from '../../../../utils/guards'

export default defineEventHandler(async (event): Promise<{ zones: CloudflareZone[] }> => {
  const workspaceId = getRouterParam(event, 'id')!
  const member = await requireMember(event, workspaceId)
  if (!member.isOwner) fail(403, 'forbidden', 'Only the owner can manage this installation')
  const { env } = cf(event)
  const accountId = env.DISCOFLARE_ACCOUNT_ID?.trim() || ''
  const workerName = env.DISCOFLARE_WORKER_NAME?.trim() || ''
  const bearer = env.DISCOFLARE_ADMIN_CAPABILITY?.trim() || ''
  if (env.DISCOFLARE_MANAGEMENT_MODE !== 'admin' || !env.DISCOFLARE_ADMIN || !accountId || !workerName || !bearer) {
    fail(409, 'admin_unavailable', 'This installation is not connected to Discoflare Admin')
  }
  const response = await env.DISCOFLARE_ADMIN.fetch('https://discoflare-admin.internal/api/internal/zones', {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${bearer}`,
      'X-Discoflare-Account-Id': accountId,
      'X-Discoflare-Worker-Name': workerName,
    },
  })
  if (!response.ok) fail(response.status, 'zones_failed', 'Discoflare Admin could not list Cloudflare domains')
  return await response.json() as { zones: CloudflareZone[] }
})
