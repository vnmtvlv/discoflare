import { eq } from 'drizzle-orm'
import { taskRuns, tasks } from '../../../../drizzle/schema'
import { nowIso, WORKSPACE_ID } from '../../../../shared/ids'
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
  const db = getDb(env.DB)
  const task = await requireTask(env, taskId)
  if (!task.activeRunId || task.status !== 'running') fail(409, 'not_running', 'Task is not running')
  const run = (await db.select().from(taskRuns).where(eq(taskRuns.id, task.activeRunId)).limit(1))[0]
  if (!run?.workflowId) fail(409, 'workflow_missing', 'Running task has no workflow')
  const instance = await env.AGENT_TASK_WORKFLOW.get(run.workflowId)
  try {
    await instance.terminate()
  }
  catch {
    // The status check below resolves terminate-versus-completion races.
  }
  const state = await reconcileTaskRun(env, run)
  if (state.status !== 'terminated') {
    waitUntil(signalTasksChanged(env, task.boardId, taskId))
    return { status: state.status }
  }
  const now = nowIso()
  await db.batch([
    db.update(taskRuns).set({ status: 'cancelled', progress: null, cancelledAt: now, cancelledBy: actor.user.id, completedAt: now }).where(eq(taskRuns.id, run.id)),
    db.update(tasks).set({ status: run.taskStatusBefore, activeRunId: null, updatedAt: now }).where(eq(tasks.activeRunId, run.id)),
  ])
  await writeAudit(env, { workspaceId: WORKSPACE_ID, actorId: actor.user.id, action: 'task.cancel', targetType: 'task', targetId: taskId, meta: { runId: run.id, workflowId: run.workflowId } })
  waitUntil(signalTasksChanged(env, task.boardId, taskId))
  return { status: 'cancelled' }
})
