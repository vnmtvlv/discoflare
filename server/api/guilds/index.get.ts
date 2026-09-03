import { eq } from 'drizzle-orm'
import { guildMembers, guilds } from '../../../drizzle/schema'
import { requireUser } from '../../utils/auth'
import { cf } from '../../utils/cf'
import { getDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { env } = cf(event)
  const db = getDb(env.DB)
  const rows = await db.select({
    id: guilds.id,
    name: guilds.name,
    iconR2Key: guilds.iconR2Key,
    ownerId: guilds.ownerId,
    createdAt: guilds.createdAt,
  }).from(guildMembers)
    .innerJoin(guilds, eq(guilds.id, guildMembers.guildId))
    .where(eq(guildMembers.userId, user.id))
  return { guilds: rows }
})
