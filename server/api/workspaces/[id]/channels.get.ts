import { eq } from 'drizzle-orm'
import { channelCategories, channelMembers, channels } from '../../../../drizzle/schema'
import { channelUnreadCounts } from '../../../../workers/unread'
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
  const mailboxRows = await env.DB.prepare('SELECT channel_id as channelId FROM email_mailboxes').all<{ channelId: string }>()
  const mailboxIds = new Set((mailboxRows.results ?? []).map(row => row.channelId))
  const list = (await db.select().from(channels).orderBy(channels.position))
    .filter((ch) => !mailboxIds.has(ch.id) && ch.type !== 'dm' && ch.type !== 'thread' && (ch.visibility === 'workspace' || privateIds.has(ch.id)))
  const unread = await channelUnreadCounts(env.DB, member.user.id, list.map(channel => channel.id))

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
        unread: (unread.get(ch.id) ?? 0) > 0,
        unreadCount: unread.get(ch.id) ?? 0,
        huddle: null,
        createdAt: ch.createdAt,
      }
    }),
  }
})
