import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { messageMentions, messages } from '../../../drizzle/schema'
import { extractMentionIds } from '../../../shared/mentions'
import { nowIso } from '../../../shared/ids'
import { requireChannelMember } from '../../utils/guards'
import { cf, fail } from '../../utils/cf'
import { getDb } from '../../utils/db'
import { hydrateMessages } from '../../utils/messages'
import { parseBody } from '../../utils/validate'

const bodySchema = z.object({
  content: z.string().min(1).max(2000),
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { env } = cf(event)
  const db = getDb(env.DB)
  const row = (await db.select().from(messages).where(eq(messages.id, id)).limit(1))[0]
  if (!row) fail(404, 'not_found', 'Message not found')
  const member = await requireChannelMember(event, row.channelId)
  if (row.authorId !== member.user.id) fail(403, 'forbidden', 'Not your message')
  const body = parseBody(bodySchema, await readBody(event))
  const editedAt = nowIso()
  await db.update(messages).set({ content: body.content, editedAt }).where(eq(messages.id, id))
  await db.delete(messageMentions).where(eq(messageMentions.messageId, id))
  for (const uid of extractMentionIds(body.content)) {
    await db.insert(messageMentions).values({ messageId: id, userId: uid }).onConflictDoNothing()
  }
  const updated = (await db.select().from(messages).where(eq(messages.id, id)).limit(1))[0]!
  const [dto] = await hydrateMessages(env, [updated])
  try {
    const stub = asRpc<{ fanout: (msg: unknown) => Promise<void> }>(env.CHANNEL_DO.getByName(`channel:${row.channelId}`))
    await stub.fanout({ t: 'message.update', message: dto })
  }
  catch { /* ignore */ }
  return { message: dto }
})
