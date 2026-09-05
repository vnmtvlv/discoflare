import type { ServerDeletionStartDTO } from '../../../../shared/deletion'
import { cf, fail } from '../../../utils/cf'
import { requireMember } from '../../../utils/guards'
import { managedInstallationOrigin, managedUninstallUrl } from '../../../utils/installation-management'
import { writeAudit } from '../../../utils/messages'

const CLAIM_TTL_SECONDS = 15 * 60

export default defineEventHandler(async (event): Promise<ServerDeletionStartDTO> => {
  const workspaceId = getRouterParam(event, 'id')!
  const member = await requireMember(event, workspaceId)
  if (!member.isOwner) fail(403, 'forbidden', 'Only the owner can delete this server')

  const { env } = cf(event)
  if (env.DISCOFLARE_INSTALLATION !== 'discoflare.com/v1') {
    fail(409, 'manual_installation', 'This installation must be removed manually in Cloudflare')
  }
  const claim = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '')
  const origin = managedInstallationOrigin(env, getRequestURL(event).origin)
  const expiresAt = new Date(Date.now() + CLAIM_TTL_SECONDS * 1_000).toISOString()
  await env.TICKETS.put(`server-deletion:${claim}`, JSON.stringify({ workspaceId, ownerId: member.user.id, origin }), {
    expirationTtl: CLAIM_TTL_SECONDS,
  })
  await writeAudit(env, {
    workspaceId,
    actorId: member.user.id,
    action: 'server.delete.request',
    targetType: 'workspace',
    targetId: workspaceId,
  })
  return { uninstallUrl: managedUninstallUrl(origin, claim), expiresAt }
})
