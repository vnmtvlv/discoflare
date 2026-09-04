import type { TaskBoardDTO } from '../../../../shared/types'
import { Permission } from '../../../../shared/permissions'
import { requireMember } from '../../../utils/guards'
import { cf } from '../../../utils/cf'
import { loadTaskBoards } from '../../../utils/task-data'

export default defineEventHandler(async (event): Promise<{ boards: TaskBoardDTO[] }> => {
  const workspaceId = getRouterParam(event, 'id')!
  await requireMember(event, workspaceId, Permission.manageTasks)
  const includeArchived = getQuery(event).archived === 'true'
  return { boards: await loadTaskBoards(cf(event).env, includeArchived) }
})
