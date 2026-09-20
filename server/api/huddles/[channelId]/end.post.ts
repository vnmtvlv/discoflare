import { hasPermission, Permission } from '../../../../shared/permissions'
import { requireChannelAccess } from '../../../utils/guards'
import { cf, fail } from '../../../utils/cf'
import { writeAudit } from '../../../utils/messages'

export default defineEventHandler(async (event) => {
  const channelId = getRouterParam(event, 'channelId')!
  const member = await requireChannelAccess(event, channelId)
  const { env } = cf(event)
  const stub = asRpc<{
    getHuddle: () => Promise<{ active: boolean; startedBy: string | null }>
    endHuddle: (actor: typeof member.user) => Promise<unknown>
  }>(env.CHANNEL_DO.getByName(`channel:${channelId}`))
  const huddle = await stub.getHuddle()
  if (!huddle.active) fail(404, 'not_found', 'No live session to end')
  const canManage = member.isOwner || hasPermission(member.perms, Permission.manageChannels)
  if (huddle.startedBy !== member.user.id && !canManage) fail(403, 'forbidden', 'Only the starter or a channel manager can end this live session')
  await stub.endHuddle(member.user)
  await writeAudit(env, { workspaceId: member.workspaceId, actorId: member.user.id, action: 'huddle.end', targetType: 'channel', targetId: channelId })
  return { ok: true }
})
