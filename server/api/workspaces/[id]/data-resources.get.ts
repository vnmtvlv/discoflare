import type { DataResourcesDTO } from '../../../../shared/types'
import { Permission } from '../../../../shared/permissions'
import { cf } from '../../../utils/cf'
import { loadDataResources } from '../../../utils/data-resources'
import { requireMember } from '../../../utils/guards'

export default defineEventHandler(async (event): Promise<DataResourcesDTO> => {
  const workspaceId = getRouterParam(event, 'id')!
  await requireMember(event, workspaceId, Permission.manageDatabases)
  return loadDataResources(cf(event).env)
})
