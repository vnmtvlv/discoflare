import { and, eq } from 'drizzle-orm'
import { dmParticipants } from '../../../../drizzle/schema'
import { nowIso } from '../../../../shared/ids'
import { requireChannelAccess } from '../../../utils/guards'
import { cf, fail } from '../../../utils/cf'
import { getDb } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const access = await requireChannelAccess(event, id)
  if (access.channel.type !== 'dm') fail(404, 'not_found', 'Channel not found')
  const { env } = cf(event)
  const db = getDb(env.DB)
  await db.update(dmParticipants).set({ hiddenAt: nowIso() }).where(and(eq(dmParticipants.channelId, id), eq(dmParticipants.userId, access.user.id)))
  return { ok: true }
})
