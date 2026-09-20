import { WORKSPACE_ID } from '../../../../../shared/ids'
import { loadRealtimeKitConfig } from '../../../../../workers/realtimekit'
import { cf, fail } from '../../../../utils/cf'
import { requireMember } from '../../../../utils/guards'
import { writeAudit } from '../../../../utils/messages'

export default defineEventHandler(async (event): Promise<{ apiToken: string }> => {
  setHeader(event, 'Cache-Control', 'no-store, max-age=0')
  setHeader(event, 'Pragma', 'no-cache')
  const workspaceId = getRouterParam(event, 'id')!
  const member = await requireMember(event, workspaceId)
  if (!member.isOwner) fail(403, 'forbidden', 'Only the owner can reveal the RealtimeKit API token')

  const { env } = cf(event)
  const config = await loadRealtimeKitConfig(env)
  if (config.source === 'deployment') {
    fail(400, 'managed_by_deployment', 'Deployment-managed secrets cannot be revealed here')
  }
  if (!config.apiTokenConfigured) fail(404, 'not_found', 'RealtimeKit API token not configured')
  if (!config.secretReadable || !config.apiKey) {
    fail(409, 'secret_unreadable', 'Saved API token cannot be decrypted')
  }

  await writeAudit(env, {
    workspaceId: WORKSPACE_ID,
    actorId: member.user.id,
    action: 'realtimekit.token.reveal',
    targetType: 'workspace',
    targetId: WORKSPACE_ID,
  })
  return { apiToken: config.apiKey }
})
