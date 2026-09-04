import { and, eq } from 'drizzle-orm'
import { channelMembers } from '../../../../../drizzle/schema'
import { requireChannelAccess } from '../../../../utils/guards'
import { cf, fail } from '../../../../utils/cf'
import { getDb } from '../../../../utils/db'
import { fanoutDm, loadParticipants } from '../../../../utils/dms'
import { endMeeting, loadRealtimeKitConfig } from '../../../../../workers/realtimekit'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const userId = getRouterParam(event, 'userId')!
  const access = await requireChannelAccess(event, id)
  if (access.channel.type !== 'dm') fail(404, 'not_found', 'Channel not found')
  if (userId !== access.user.id && access.participants.length < 3) fail(403, 'forbidden', 'Cannot kick from a 1:1')
  const { env } = cf(event)
  const db = getDb(env.DB)
  await db.delete(channelMembers).where(and(eq(channelMembers.channelId, id), eq(channelMembers.userId, userId)))
  const remaining = await loadParticipants(env, id)
  await fanoutDm(env, id, { t: 'dm.participants', participants: remaining })
  if (!remaining.length && access.channel.huddleMeetingId) {
    await endMeeting(await loadRealtimeKitConfig(env), access.channel.huddleMeetingId)
  }
  return { ok: true }
})
