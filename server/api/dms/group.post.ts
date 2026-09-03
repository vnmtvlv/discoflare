import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { channels, dmParticipants, guildMembers } from '../../../drizzle/schema'
import { DM_GROUP_MAX, DM_GROUP_MIN } from '../../../shared/dm'
import { newId, nowIso } from '../../../shared/ids'
import { requireUser } from '../../utils/auth'
import { cf, fail } from '../../utils/cf'
import { getDb } from '../../utils/db'
import { toDmDto } from '../../utils/dms'
import { parseBody } from '../../utils/validate'

const bodySchema = z.object({
  userIds: z.array(z.string().min(8)).min(2).max(DM_GROUP_MAX),
  guildId: z.string().min(8).optional(),
})

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const body = parseBody(bodySchema, await readBody(event))
  const { env } = cf(event)
  const db = getDb(env.DB)
  let guildId = body.guildId
  if (!guildId) {
    guildId = (await db.select({ guildId: guildMembers.guildId }).from(guildMembers).where(eq(guildMembers.userId, me.id)).limit(1))[0]?.guildId
  }
  if (!guildId) fail(400, 'bad_request', 'No workspace')

  const ids = [...new Set([me.id, ...body.userIds])]
  if (ids.length < DM_GROUP_MIN || ids.length > DM_GROUP_MAX) fail(400, 'bad_request', 'Group DMs need 3–25 people')

  const members = await db.select({ userId: guildMembers.userId }).from(guildMembers)
    .where(and(eq(guildMembers.guildId, guildId), inArray(guildMembers.userId, ids)))
  if (members.length !== ids.length) fail(403, 'forbidden', 'Every participant must be in the workspace')

  const id = newId()
  const created = nowIso()
  await db.insert(channels).values({
    id,
    guildId,
    name: 'dm',
    topic: '',
    type: 'dm',
    position: 0,
    huddleMeetingId: null,
    parentId: null,
    parentMessageId: null,
    createdAt: created,
  })
  await db.insert(dmParticipants).values(ids.map((userId) => ({
    channelId: id,
    userId,
    hiddenAt: null,
    joinedAt: created,
  })))
  const ch = (await db.select().from(channels).where(eq(channels.id, id)).limit(1))[0]!
  return { channel: await toDmDto(env, ch, me.id, false) }
})
