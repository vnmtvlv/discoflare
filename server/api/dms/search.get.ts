import { and, eq, like, or } from 'drizzle-orm'
import { authUsers, users } from '../../../drizzle/schema'
import { requireUser } from '../../utils/auth'
import { cf, fail } from '../../utils/cf'
import { getDb } from '../../utils/db'
import { toPublicUser } from '../../utils/messages'
import { requireMember } from '../../utils/guards'
import { WORKSPACE_ID } from '../../../shared/ids'

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const q = String(getQuery(event).q || '').trim().toLowerCase()
  const workspaceId = String(getQuery(event).workspaceId || WORKSPACE_ID)
  if (workspaceId !== WORKSPACE_ID) fail(404, 'not_found', 'Workspace not found')
  await requireMember(event, workspaceId)
  const { env } = cf(event)
  const db = getDb(env.DB)
  const rows = await db.select({ user: users }).from(users)
    .innerJoin(authUsers, eq(authUsers.id, users.id))
    .where(and(
      eq(users.status, 'active'),
      q
        ? or(
            like(users.displayName, `%${q}%`),
            like(users.nickname, `%${q}%`),
            like(users.handle, `%${q}%`),
          )
        : undefined,
    ))
    .limit(20)
  return {
    members: rows.filter((r) => r.user.id !== me.id).map((r) => ({
      ...toPublicUser(r.user),
      handle: r.user.handle,
      nickname: r.user.nickname,
    })),
  }
})
