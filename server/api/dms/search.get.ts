import { requireUser } from '../../utils/auth'
import { cf, fail } from '../../utils/cf'
import { searchDmMembers } from '../../utils/dm-search'
import { requireMember } from '../../utils/guards'
import { WORKSPACE_ID } from '../../../shared/ids'

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const q = String(getQuery(event).q || '').trim().toLowerCase()
  const workspaceId = String(getQuery(event).workspaceId || WORKSPACE_ID)
  if (workspaceId !== WORKSPACE_ID) fail(404, 'not_found', 'Workspace not found')
  await requireMember(event, workspaceId)
  const { env } = cf(event)
  return {
    members: await searchDmMembers(env.DB, me.id, q),
  }
})
