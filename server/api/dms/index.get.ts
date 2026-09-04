import { and, eq, isNull } from 'drizzle-orm'
import { channels, channelMembers } from '../../../drizzle/schema'
import { channelHasUnread } from '../../../workers/unread'
import { requireUser } from '../../utils/auth'
import { cf } from '../../utils/cf'
import { getDb } from '../../utils/db'
import { toDmDto } from '../../utils/dms'

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const { env } = cf(event)
  const db = getDb(env.DB)
  const mine = await db.select({
    channel: channels,
    hiddenAt: channelMembers.hiddenAt,
  }).from(channelMembers)
    .innerJoin(channels, eq(channels.id, channelMembers.channelId))
    .where(and(eq(channelMembers.userId, me.id), eq(channels.type, 'dm'), isNull(channelMembers.hiddenAt)))

  const dtos = []
  for (const row of mine) {
    dtos.push(await toDmDto(env, row.channel, me.id, await channelHasUnread(env.DB, me.id, row.channel.id)))
  }
  dtos.sort((a, b) => (b.lastMessageAt || b.createdAt).localeCompare(a.lastMessageAt || a.createdAt))
  return { channels: dtos }
})
