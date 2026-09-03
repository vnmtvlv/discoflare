import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { channels, guildMembers } from '../../../drizzle/schema'
import { requireUser } from '../../utils/auth'
import { cf, fail } from '../../utils/cf'
import { getDb } from '../../utils/db'
import { openPairDm, toDmDto } from '../../utils/dms'
import { parseBody } from '../../utils/validate'

const bodySchema = z.object({
  userId: z.string().min(8),
  guildId: z.string().min(8).optional(),
})

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const body = parseBody(bodySchema, await readBody(event))
  if (body.userId === me.id) fail(400, 'bad_request', 'Cannot DM yourself')
  const { env } = cf(event)
  const db = getDb(env.DB)

  let guildId = body.guildId
  if (!guildId) {
    const mine = await db.select({ guildId: guildMembers.guildId }).from(guildMembers).where(eq(guildMembers.userId, me.id)).limit(1)
    guildId = mine[0]?.guildId
  }
  if (!guildId) fail(400, 'bad_request', 'No workspace')

  const both = await db.select().from(guildMembers).where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, body.userId))).limit(1)
  if (!both[0]) fail(403, 'forbidden', 'User is not in this workspace')

  const id = await openPairDm(env, guildId, me.id, body.userId)
  const ch = (await db.select().from(channels).where(eq(channels.id, id)).limit(1))[0]!
  return { channel: await toDmDto(env, ch, me.id, false) }
})
