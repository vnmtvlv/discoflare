import type { DatabaseDTO } from '../../../../shared/types'
import { Permission } from '../../../../shared/permissions'
import { requireMember } from '../../../utils/guards'
import { cf } from '../../../utils/cf'
import { loadDatabases } from '../../../utils/database-data'

export default defineEventHandler(async (event): Promise<{ databases: DatabaseDTO[] }> => {
  const workspaceId = getRouterParam(event, 'id')!
  await requireMember(event, workspaceId, Permission.manageDatabases)
  return { databases: await loadDatabases(cf(event).env, getQuery(event).archived === 'true') }
})
