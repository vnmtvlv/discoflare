import { and, eq, like, or } from 'drizzle-orm'
import { guildMembers, users } from '../../../drizzle/schema'
import { requireUser } from '../../utils/auth'
import { cf, fail } from '../../utils/cf'
import { getDb } from '../../utils/db'
import { toPublicUser } from '../../utils/messages'
import { requireMember } from '../../utils/guards'

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const q = String(getQuery(event).q || '').trim().toLowerCase()
  const guildId = String(getQuery(event).guildId || '')
  if (!guildId) fail(400, 'bad_request', 'guildId required')
  await requireMember(event, guildId)
  const { env } = cf(event)
  const db = getDb(env.DB)
  const rows = await db.select({ user: users }).from(guildMembers)
    .innerJoin(users, eq(users.id, guildMembers.userId))
    .where(and(
      eq(guildMembers.guildId, guildId),
      q
        ? or(like(users.displayName, `%${q}%`), like(users.email, `%${q}%`))
        : undefined,
    ))
    .limit(20)
  return {
    members: rows.filter((r) => r.user.id !== me.id).map((r) => toPublicUser(r.user)),
  }
})
