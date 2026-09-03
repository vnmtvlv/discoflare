import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { attachments, channels, messages } from '../../../../drizzle/schema'
import { newId, nowIso } from '../../../../shared/ids'
import { threadTitle } from '../../../../shared/threads'
import { requireChannelAccess } from '../../../utils/guards'
import { cf, fail } from '../../../utils/cf'
import { getDb } from '../../../utils/db'
import { parseBody } from '../../../utils/validate'

const bodySchema = z.object({
  messageId: z.string().min(8),
  name: z.string().min(1).max(80).optional(),
})

export default defineEventHandler(async (event) => {
  const parentId = getRouterParam(event, 'id')!
  const access = await requireChannelAccess(event, parentId)
  if (access.channel.type !== 'text' && access.channel.type !== 'dm') fail(400, 'bad_request', 'Threads hang off text or DMs')
  const body = parseBody(bodySchema, await readBody(event))
  const { env } = cf(event)
  const db = getDb(env.DB)
  const msg = (await db.select().from(messages).where(and(eq(messages.id, body.messageId), eq(messages.channelId, parentId))).limit(1))[0]
  if (!msg) fail(404, 'not_found', 'Message not found')
  const existing = (await db.select().from(channels).where(eq(channels.parentMessageId, body.messageId)).limit(1))[0]
  const attachmentRows = await db.select({ filename: attachments.filename }).from(attachments).where(eq(attachments.messageId, body.messageId))
  const title = body.name?.trim() || threadTitle(msg.content, attachmentRows.map(row => row.filename))
  if (existing) return { channel: { ...existing, title } }
  const id = newId()
  const created = nowIso()
  await db.insert(channels).values({
    id,
    name: title,
    topic: '',
    type: 'thread',
    visibility: access.channel.visibility,
    position: 0,
    huddleMeetingId: null,
    parentId,
    parentMessageId: body.messageId,
    createdAt: created,
    updatedAt: created,
  })
  const row = (await db.select().from(channels).where(eq(channels.id, id)).limit(1))[0]
  return { channel: { ...row, title } }
})
