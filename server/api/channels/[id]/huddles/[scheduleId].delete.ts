import { hasPermission, Permission } from '../../../../../shared/permissions'
import { cf, fail } from '../../../../utils/cf'
import { requireChannelAccess } from '../../../../utils/guards'
import { writeAudit } from '../../../../utils/messages'

export default defineEventHandler(async (event) => {
  const channelId = getRouterParam(event, 'id')!
  const scheduleId = getRouterParam(event, 'scheduleId')!
  const member = await requireChannelAccess(event, channelId)
  const { env } = cf(event)
  const row = await env.DB.prepare(
    `SELECT created_by FROM scheduled_huddles
     WHERE id = ? AND channel_id = ? AND status IN ('scheduled', 'ready')`,
  ).bind(scheduleId, channelId).first<{ created_by: string }>()
  if (!row) fail(404, 'not_found', 'Scheduled huddle not found')
  const canManage = member.isOwner || hasPermission(member.perms, Permission.manageChannels)
  if (row.created_by !== member.user.id && !canManage) fail(403, 'forbidden', 'Only the creator or a channel manager can cancel this huddle')
  await env.DB.prepare(
    `UPDATE scheduled_huddles SET status = 'cancelled', updated_at = ? WHERE id = ?`,
  ).bind(new Date().toISOString(), scheduleId).run()
  await writeAudit(env, {
    workspaceId: member.workspaceId,
    actorId: member.user.id,
    action: 'huddle.schedule.cancel',
    targetType: 'scheduled_huddle',
    targetId: scheduleId,
    meta: { channelId },
  })
  const stub = asRpc<{
    refreshScheduleAlarm: () => Promise<void>
    fanout: (message: unknown) => Promise<void>
  }>(env.CHANNEL_DO.getByName(`channel:${channelId}`))
  await stub.refreshScheduleAlarm()
  await stub.fanout({ t: 'huddle.schedule', channelId })
  return { ok: true }
})
