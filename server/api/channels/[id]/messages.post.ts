import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { attachments, messageMentions, messages } from '../../../../drizzle/schema'
import { extractMentionIds } from '../../../../shared/mentions'
import { newId, nowIso } from '../../../../shared/ids'
import { Permission } from '../../../../shared/permissions'
import { requireChannelMember } from '../../../utils/guards'
import { cf } from '../../../utils/cf'
import { getDb } from '../../../utils/db'
import { hydrateMessages } from '../../../utils/messages'
import { unhideAll } from '../../../utils/dms'
import { parseBody } from '../../../utils/validate'

const bodySchema = z.object({
  content: z.string().max(2000),
  replyToId: z.string().min(8).optional(),
  clientId: z.string().min(1).max(80).optional(),
  attachmentIds: z.array(z.string()).max(8).optional(),
})

export default defineEventHandler(async (event) => {
  const channelId = getRouterParam(event, 'id')!
  const member = await requireChannelMember(event, channelId, Permission.sendMessages)
  const body = parseBody(bodySchema, await readBody(event))
  if (!body.content.trim() && !(body.attachmentIds?.length)) {
    throw createError({ statusCode: 400, data: { error: { code: 'bad_request', message: 'Empty message' } } })
  }
  const { env } = cf(event)
  const db = getDb(env.DB)
  const id = newId()
  const created = nowIso()
  await db.insert(messages).values({
    id,
    channelId,
    guildId: member.guildId,
    authorId: member.user.id,
    content: body.content,
    replyToId: body.replyToId ?? null,
    editedAt: null,
    deletedAt: null,
    createdAt: created,
  })
  const mentions = extractMentionIds(body.content)
  for (const uid of mentions) {
    await db.insert(messageMentions).values({ messageId: id, userId: uid }).onConflictDoNothing()
  }
  if (body.attachmentIds?.length) {
    for (const attId of body.attachmentIds) {
      await db.update(attachments).set({ messageId: id }).where(eq(attachments.id, attId))
    }
  }
  if (member.channel.type === 'dm') await unhideAll(env, channelId)
  const row = (await db.select().from(messages).where(eq(messages.id, id)).limit(1))[0]!
  const [dto] = await hydrateMessages(env, [row], member.user.id)
  try {
    const stub = asRpc<{ fanout: (msg: unknown) => Promise<void> }>(env.CHANNEL_DO.getByName(`channel:${channelId}`))
    await stub.fanout({ t: 'message', message: dto })
  }
  catch { /* local without DO */ }
  return { message: dto }
})
