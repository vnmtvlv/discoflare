import { version as packageVersion } from '../../../../package.json'
import { installDiscoflare } from '../../../../packages/installer-core/src/index'
import { WORKSPACE_ID } from '../../../../shared/ids'
import { cf, fail } from '../../../utils/cf'
import { requireMember } from '../../../utils/guards'
import { manualManagementRequest } from '../../../utils/installation-management'
import { writeAudit } from '../../../utils/messages'

export default defineEventHandler(async (event): Promise<{ disconnected: true, tokenId: string }> => {
  const workspaceId = getRouterParam(event, 'id')!
  const member = await requireMember(event, workspaceId)
  if (!member.isOwner) fail(403, 'forbidden', 'Only the owner can manage this installation')

  const { env } = cf(event)
  const token = env.DISCOFLARE_ADMIN_TOKEN?.trim() || ''
  const tokenId = env.DISCOFLARE_ADMIN_TOKEN_ID?.trim() || ''
  if (env.DISCOFLARE_MANAGEMENT_MODE !== 'managed' || !token || !tokenId) {
    fail(409, 'not_managed', 'Cloudflare management is not connected')
  }

  try {
    await installDiscoflare(token, manualManagementRequest(env, `v${packageVersion}`))
  }
  catch (error) {
    const message = error && typeof error === 'object' && 'statusMessage' in error
      ? String(error.statusMessage)
      : error instanceof Error ? error.message : 'Cloudflare management could not be disconnected'
    fail(502, 'management_disconnect_failed', message)
  }

  await writeAudit(env, {
    workspaceId: WORKSPACE_ID,
    actorId: member.user.id,
    action: 'installation.management.disconnect',
    targetType: 'workspace',
    targetId: WORKSPACE_ID,
  })
  return { disconnected: true, tokenId }
})
