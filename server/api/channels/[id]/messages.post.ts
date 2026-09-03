import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { messages } from '../../../../drizzle/schema'
import { extractMentionIds } from '../../../../shared/mentions'
import { newId, nowIso } from '../../../../shared/ids'
import { Permission } from '../../../../shared/permissions'
import { requireChannelMember } from '../../../utils/guards'
import { cf, fail } from '../../../utils/cf'
import { getDb } from '../../../utils/db'
import { hydrateMessages } from '../../../utils/messages'
import { unhideAll } from '../../../utils/dms'
import { parseBody } from '../../../utils/validate'

const bodySchema = z.object({
  content: z.string().max(2000),
  replyToId: z.string().min(8).optional(),
  clientId: z.string().min(1).max(80).optional(),
  attachmentIds: z.array(z.string().min(8)).max(8).optional(),
})

export default defineEventHandler(async (event) => {
  const channelId = getRouterParam(event, 'id')!
  const member = await requireChannelMember(event, channelId, Permission.sendMessages)
  const body = parseBody(bodySchema, await readBody(event))
  if (!body.content.trim() && !body.attachmentIds?.length) fail(400, 'bad_request', 'Empty message')

  const { env } = cf(event)
  if (body.replyToId) {
    const reply = await env.DB.prepare(
      'SELECT id FROM messages WHERE id = ? AND channel_id = ?',
    ).bind(body.replyToId, channelId).first()
    if (!reply) fail(400, 'bad_request', 'Invalid reply target')
  }

  const requestedAttachments = [...new Set(body.attachmentIds ?? [])]
  const attachmentRows = [] as Array<{ id: string }>
  if (requestedAttachments.length) {
    const placeholders = requestedAttachments.map(() => '?').join(',')
    const rows = await env.DB.prepare(
      `SELECT id FROM attachments
       WHERE id IN (${placeholders}) AND message_id IS NULL AND channel_id = ? AND uploader_id = ?`,
    ).bind(...requestedAttachments, channelId, member.user.id).all<{ id: string }>()
    attachmentRows.push(...(rows.results ?? []))
    if (attachmentRows.length !== requestedAttachments.length) fail(400, 'bad_request', 'Invalid attachment')
  }

  const requestedMentions = extractMentionIds(body.content)
  let mentionIds: string[] = []
  if (requestedMentions.length) {
    const placeholders = requestedMentions.map(() => '?').join(',')
    const rows = await env.DB.prepare(
      `SELECT id FROM users WHERE id IN (${placeholders}) AND status = 'active'`,
    ).bind(...requestedMentions).all<{ id: string }>()
    mentionIds = (rows.results ?? []).map((row) => row.id)
  }

  const id = newId()
  const created = nowIso()
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO messages (id, channel_id, author_id, content, reply_to_id, edited_at, deleted_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)',
    ).bind(id, channelId, member.user.id, body.content, body.replyToId ?? null, created),
    ...attachmentRows.map((attachment) => env.DB.prepare(
      'UPDATE attachments SET message_id = ? WHERE id = ? AND message_id IS NULL',
    ).bind(id, attachment.id)),
    ...mentionIds.map((userId) => env.DB.prepare(
      'INSERT OR IGNORE INTO message_mentions (message_id, user_id) VALUES (?, ?)',
    ).bind(id, userId)),
  ])

  if (member.channel.type === 'dm') await unhideAll(env, channelId)
  const db = getDb(env.DB)
  const row = (await db.select().from(messages).where(eq(messages.id, id)).limit(1))[0]!
  const [dto] = await hydrateMessages(env, [row], member.user.id)
  try {
    const stub = asRpc<{ fanout: (msg: unknown) => Promise<void> }>(env.CHANNEL_DO.getByName(`channel:${channelId}`))
    await stub.fanout({ t: 'message', message: dto })
  }
  catch { /* local without DO */ }
  return { message: dto }
})
