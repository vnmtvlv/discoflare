import { eq } from 'drizzle-orm'
import { taskRuns } from '../../../../drizzle/schema'
import { WORKSPACE_ID } from '../../../../shared/ids'
import { Permission } from '../../../../shared/permissions'
import { signalTasksChanged } from '../../../../workers/task-events'
import { cf, fail } from '../../../utils/cf'
import { getDb } from '../../../utils/db'
import { requireMember } from '../../../utils/guards'
import { writeAudit } from '../../../utils/messages'
import { reconcileTaskRun } from '../../../utils/task-runs'
import { requireTask } from '../../../utils/task-policy'

export default defineEventHandler(async (event) => {
  const actor = await requireMember(event, WORKSPACE_ID, Permission.manageTasks)
  const taskId = getRouterParam(event, 'id')!
  const { env, waitUntil } = cf(event)
  const task = await requireTask(env, taskId)
  if (!task.activeRunId) fail(409, 'not_running', 'Task has no active run')
  const run = (await getDb(env.DB).select().from(taskRuns).where(eq(taskRuns.id, task.activeRunId)).limit(1))[0]
  if (!run) fail(409, 'run_missing', 'Active task run is missing')
  let state
  try { state = await reconcileTaskRun(env, run) }
  catch (error) { fail(503, 'workflow_unavailable', error instanceof Error ? error.message : String(error)) }
  await writeAudit(env, { workspaceId: WORKSPACE_ID, actorId: actor.user.id, action: 'task.reconcile', targetType: 'task', targetId: taskId, meta: { runId: run.id, workflowStatus: state.status } })
  waitUntil(signalTasksChanged(env, task.boardId, taskId))
  return { status: state.status }
})
