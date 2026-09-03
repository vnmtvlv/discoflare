import { and, eq } from 'drizzle-orm'
import { guildMembers } from '../../../../../drizzle/schema'
import { Permission } from '../../../../../shared/permissions'
import { requireMember } from '../../../../utils/guards'
import { cf, fail } from '../../../../utils/cf'
import { getDb } from '../../../../utils/db'
import { writeAudit } from '../../../../utils/messages'

export default defineEventHandler(async (event) => {
  const guildId = getRouterParam(event, 'id')!
  const userId = getRouterParam(event, 'userId')!
  const actor = await requireMember(event, guildId, Permission.kick)
  if (userId === actor.ownerId) fail(403, 'forbidden', 'Owner cannot be kicked')
  if (userId === actor.user.id) fail(400, 'bad_request', 'Leave is not implemented; ask an admin')
  const { env } = cf(event)
  const db = getDb(env.DB)
  await db.delete(guildMembers).where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, userId)))
  await writeAudit(env, { guildId, actorId: actor.user.id, action: 'member.kick', targetType: 'user', targetId: userId })
  return { ok: true }
})
