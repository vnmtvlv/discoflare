import { eq } from 'drizzle-orm'
import { channelCategories, channelMembers, channels } from '../../../../drizzle/schema'
import { channelHasUnread } from '../../../../workers/unread'
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
  const unread = new Set<string>()
  for (const ch of list) {
    if (await channelHasUnread(env.DB, member.user.id, ch.id)) unread.add(ch.id)
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
