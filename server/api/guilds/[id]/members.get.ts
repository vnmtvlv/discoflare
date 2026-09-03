import { eq } from 'drizzle-orm'
import { guildMembers, roles, users } from '../../../../drizzle/schema'
import { requireMember } from '../../../utils/guards'
import { cf } from '../../../utils/cf'
import { getDb } from '../../../utils/db'
import { toPublicUser } from '../../../utils/messages'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  await requireMember(event, id)
  const { env } = cf(event)
  const db = getDb(env.DB)

  let presence: Array<{ userId: string; status: 'online' | 'idle' | 'offline' }> = []
  try {
    const stub = asRpc<{
      snapshot: () => Promise<Array<{ userId: string; status: 'online' | 'idle' | 'offline' }>>
    }>(env.GUILD_DO.getByName(`guild:${id}`))
    presence = await stub.snapshot()
  }
  catch {
    // Guild DO may be cold in nuxt-only local dev
  }
  const statusMap = new Map(presence.map((p) => [p.userId, p.status]))

  const rows = await db.select({
    user: users,
    role: roles,
    nickname: guildMembers.nickname,
    lastSeenAt: guildMembers.lastSeenAt,
  }).from(guildMembers)
    .innerJoin(users, eq(users.id, guildMembers.userId))
    .innerJoin(roles, eq(roles.id, guildMembers.roleId))
    .where(eq(guildMembers.guildId, id))

  return {
    members: rows.map((r) => ({
      user: toPublicUser(r.user),
      role: {
        id: r.role.id,
        guildId: r.role.guildId,
        name: r.role.name,
        permissions: r.role.permissionsBitmask,
        position: r.role.position,
      },
      nickname: r.nickname,
      lastSeenAt: r.lastSeenAt,
      status: statusMap.get(r.user.id) ?? 'offline',
    })),
  }
})
