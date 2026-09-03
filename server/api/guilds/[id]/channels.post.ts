import { z } from 'zod'
import { channels } from '../../../../drizzle/schema'
import { newId, nowIso } from '../../../../shared/ids'
import { Permission } from '../../../../shared/permissions'
import { requireMember } from '../../../utils/guards'
import { cf } from '../../../utils/cf'
import { getDb } from '../../../utils/db'
import { parseBody } from '../../../utils/validate'
import { writeAudit } from '../../../utils/messages'

const bodySchema = z.object({
  name: z.string().min(1).max(80).regex(/^[a-z0-9-_]+$/i),
  type: z.enum(['text', 'huddle', 'voice']).default('text'),
  topic: z.string().max(200).optional(),
})

export default defineEventHandler(async (event) => {
  const guildId = getRouterParam(event, 'id')!
  const member = await requireMember(event, guildId, Permission.manageChannels)
  const body = parseBody(bodySchema, await readBody(event))
  const { env } = cf(event)
  const db = getDb(env.DB)
  const id = newId()
  const created = nowIso()
  const name = body.name.toLowerCase()
  const type = body.type === 'huddle' ? 'voice' : body.type
  await db.insert(channels).values({
    id,
    guildId,
    name,
    topic: body.topic ?? '',
    type,
    position: Date.now() % 100000,
    huddleMeetingId: null,
    parentId: null,
    parentMessageId: null,
    createdAt: created,
  })
  await writeAudit(env, { guildId, actorId: member.user.id, action: 'channel.create', targetType: 'channel', targetId: id, meta: { name } })
  return {
    channel: {
      id,
      guildId,
      name,
      topic: body.topic ?? '',
      type,
      position: 0,
      huddleMeetingId: null,
      parentId: null,
      parentMessageId: null,
      unread: false,
      huddle: null,
      createdAt: created,
    },
  }
})
