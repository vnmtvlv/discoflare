import { and, eq } from 'drizzle-orm'
import { channelReads, channels } from '../../../../drizzle/schema'
import { requireMember } from '../../../utils/guards'
import { cf } from '../../../utils/cf'
import { getDb } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const guildId = getRouterParam(event, 'id')!
  const member = await requireMember(event, guildId)
  const { env } = cf(event)
  const db = getDb(env.DB)
  const list = (await db.select().from(channels).where(eq(channels.guildId, guildId)).orderBy(channels.position))
    .filter((ch) => ch.type !== 'dm' && ch.type !== 'thread')
  const reads = await db.select().from(channelReads).where(and(eq(channelReads.guildId, guildId), eq(channelReads.userId, member.user.id)))
  const readMap = new Map(reads.map((r) => [r.channelId, r.lastReadMessageId]))

  const latest: Record<string, string> = {}
  for (const ch of list) {
    const row = await env.DB.prepare(
      'SELECT id FROM messages WHERE channel_id = ? ORDER BY id DESC LIMIT 1',
    ).bind(ch.id).first<{ id: string }>()
    if (row) latest[ch.id] = row.id
  }

  return {
    channels: list.map((ch) => {
      const lastRead = readMap.get(ch.id)
      const last = latest[ch.id]
      return {
        id: ch.id,
        guildId: ch.guildId,
        name: ch.name,
        topic: ch.topic,
        type: ch.type,
        position: ch.position,
        huddleMeetingId: ch.huddleMeetingId,
        parentId: ch.parentId,
        parentMessageId: ch.parentMessageId,
        unread: Boolean(last && last !== lastRead),
        huddle: null,
        createdAt: ch.createdAt,
      }
    }),
  }
})
