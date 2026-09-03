import { eq } from 'drizzle-orm'
import { channelCategories, channelMembers, channelReads, channels } from '../../../../drizzle/schema'
import { requireMember } from '../../../utils/guards'
import { cf } from '../../../utils/cf'
import { getDb } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const workspaceId = getRouterParam(event, 'id')!
  const member = await requireMember(event, workspaceId)
  const { env } = cf(event)
  const db = getDb(env.DB)
  const privateAccess = await db.select({ channelId: channelMembers.channelId }).from(channelMembers).where(eq(channelMembers.userId, member.user.id))
  const privateIds = new Set(privateAccess.map(row => row.channelId))
  const list = (await db.select().from(channels).orderBy(channels.position))
    .filter((ch) => ch.type !== 'dm' && ch.type !== 'thread' && (ch.visibility === 'workspace' || privateIds.has(ch.id)))
  const reads = await db.select().from(channelReads).where(eq(channelReads.userId, member.user.id))
  const readMap = new Map(reads.map((r) => [r.channelId, r.lastReadMessageId]))

  const unread = new Set<string>()
  for (const ch of list) {
    const rows = await env.DB.prepare(
      `SELECT m.channel_id, m.id
       FROM messages m
       LEFT JOIN channels thread ON thread.id = m.channel_id
       WHERE m.channel_id = ? OR thread.parent_id = ?
       ORDER BY m.id DESC`,
    ).bind(ch.id, ch.id).all<{ channel_id: string; id: string }>()
    const latestByChannel = new Map<string, string>()
    for (const row of rows.results ?? []) {
      if (!latestByChannel.has(row.channel_id)) latestByChannel.set(row.channel_id, row.id)
    }
    if ([...latestByChannel].some(([channelId, last]) => {
      const lastRead = readMap.get(channelId)
      return !lastRead || lastRead < last
    })) unread.add(ch.id)
  }

  return {
    categories: await db.select({
      id: channelCategories.id,
      name: channelCategories.name,
      position: channelCategories.position,
      createdAt: channelCategories.createdAt,
    }).from(channelCategories).orderBy(channelCategories.position),
    channels: list.map((ch) => {
      return {
        id: ch.id,
        workspaceId,
        name: ch.name,
        topic: ch.topic,
        type: ch.type,
        visibility: ch.visibility,
        categoryId: ch.categoryId,
        position: ch.position,
        huddleMeetingId: ch.huddleMeetingId,
        parentId: ch.parentId,
        parentMessageId: ch.parentMessageId,
        unread: unread.has(ch.id),
        huddle: null,
        createdAt: ch.createdAt,
      }
    }),
  }
})
