import { eq } from 'drizzle-orm'
import { channels } from '../../../../drizzle/schema'
import { Permission } from '../../../../shared/permissions'
import { requireChannelMember } from '../../../utils/guards'
import { cf, fail } from '../../../utils/cf'
import { getDb } from '../../../utils/db'
import { endMeeting } from '../../../../workers/realtimekit'
import { writeAudit } from '../../../utils/messages'

export default defineEventHandler(async (event) => {
  const channelId = getRouterParam(event, 'channelId')!
  const member = await requireChannelMember(event, channelId, Permission.manageChannels)
  const { env } = cf(event)
  const db = getDb(env.DB)
  const ch = member.channel
  if (!ch.huddleMeetingId) fail(404, 'not_found', 'No huddle to end')
  await endMeeting(env, ch.huddleMeetingId)
  await db.update(channels).set({ huddleMeetingId: null }).where(eq(channels.id, channelId))
  try {
    const stub = asRpc<{ fanout: (msg: unknown) => Promise<void> }>(env.CHANNEL_DO.getByName(`channel:${channelId}`))
    await stub.fanout({
      t: 'huddle',
      huddle: { active: false, huddleId: null, meetingId: null, participantIds: [], startedBy: null, startedAt: null },
    })
  }
  catch { /* ignore */ }
  await writeAudit(env, { workspaceId: member.workspaceId, actorId: member.user.id, action: 'huddle.end', targetType: 'channel', targetId: channelId })
  return { ok: true }
})
