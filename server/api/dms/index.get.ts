import { and, eq, isNull } from 'drizzle-orm'
import { channelReads, channels, dmParticipants } from '../../../drizzle/schema'
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
    hiddenAt: dmParticipants.hiddenAt,
  }).from(dmParticipants)
    .innerJoin(channels, eq(channels.id, dmParticipants.channelId))
    .where(and(eq(dmParticipants.userId, me.id), eq(channels.type, 'dm'), isNull(dmParticipants.hiddenAt)))

  const reads = await db.select().from(channelReads).where(eq(channelReads.userId, me.id))
  const readMap = new Map(reads.map((r) => [r.channelId, r.lastReadMessageId]))

  const dtos = []
  for (const row of mine) {
    const last = await env.DB.prepare('SELECT id FROM messages WHERE channel_id = ? ORDER BY id DESC LIMIT 1').bind(row.channel.id).first<{ id: string }>()
    const lastRead = readMap.get(row.channel.id)
    dtos.push(await toDmDto(env, row.channel, me.id, Boolean(last && last.id !== lastRead)))
  }
  dtos.sort((a, b) => (b.lastMessageAt || b.createdAt).localeCompare(a.lastMessageAt || a.createdAt))
  return { channels: dtos }
})
