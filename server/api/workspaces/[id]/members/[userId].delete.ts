import { eq } from 'drizzle-orm'
import { users } from '../../../../../drizzle/schema'
import { nowIso } from '../../../../../shared/ids'
import { Permission } from '../../../../../shared/permissions'
import { requireMember } from '../../../../utils/guards'
import { cf, fail } from '../../../../utils/cf'
import { getDb } from '../../../../utils/db'
import { writeAudit } from '../../../../utils/messages'

export default defineEventHandler(async (event) => {
  const workspaceId = getRouterParam(event, 'id')!
  const userId = getRouterParam(event, 'userId')!
  const actor = await requireMember(event, workspaceId, Permission.kick)
  if (userId === actor.ownerId) fail(403, 'forbidden', 'Owner cannot be kicked')
  if (userId === actor.user.id) fail(400, 'bad_request', 'Leave is not implemented; ask an admin')
  const { env } = cf(event)
  const db = getDb(env.DB)
  await db.update(users).set({
    status: 'removed',
    roleId: null,
    nickname: null,
    joinedAt: null,
    updatedAt: nowIso(),
  }).where(eq(users.id, userId))
  await writeAudit(env, { workspaceId, actorId: actor.user.id, action: 'member.kick', targetType: 'user', targetId: userId })
  return { ok: true }
})
