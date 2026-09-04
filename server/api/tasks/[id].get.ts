import { WORKSPACE_ID } from '../../../shared/ids'
import { Permission } from '../../../shared/permissions'
import { cf, fail } from '../../utils/cf'
import { requireMember } from '../../utils/guards'
import { loadTaskDetail } from '../../utils/task-data'

export default defineEventHandler(async (event) => {
  await requireMember(event, WORKSPACE_ID, Permission.manageTasks)
  const task = await loadTaskDetail(cf(event).env, getRouterParam(event, 'id')!)
  if (!task) fail(404, 'not_found', 'Task not found')
  return { task }
})
