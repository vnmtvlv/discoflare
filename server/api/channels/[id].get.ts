import { requireChannelAccess } from '../../utils/guards'
import { cf } from '../../utils/cf'
import { toDmDto } from '../../utils/dms'
import { WORKSPACE_ID } from '../../../shared/ids'
import { threadTitle } from '../../../shared/threads'
import { attachments, messages } from '../../../drizzle/schema'
import { eq } from 'drizzle-orm'
import { getDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const access = await requireChannelAccess(event, id)
  const { env } = cf(event)
  const ch = access.channel
  if (ch.type === 'dm') {
    return { channel: await toDmDto(env, ch, access.user.id, false), frozen: access.frozen }
  }
  let title: string | undefined
  if (ch.type === 'thread' && ch.parentMessageId) {
    const db = getDb(env.DB)
    const [root] = await db.select().from(messages).where(eq(messages.id, ch.parentMessageId)).limit(1)
    const attachmentRows = await db.select({ filename: attachments.filename }).from(attachments).where(eq(attachments.messageId, ch.parentMessageId))
    title = threadTitle(root?.content ?? '', attachmentRows.map(row => row.filename))
  }
  return {
    channel: {
      id: ch.id,
      workspaceId: WORKSPACE_ID,
      name: ch.name,
      topic: ch.topic,
      type: ch.type,
      visibility: ch.visibility,
      categoryId: ch.categoryId,
      position: ch.position,
      huddleMeetingId: ch.huddleMeetingId,
      parentId: ch.parentId,
      parentMessageId: ch.parentMessageId,
      unread: false,
      huddle: null,
      createdAt: ch.createdAt,
      title,
    },
    frozen: false,
  }
})
