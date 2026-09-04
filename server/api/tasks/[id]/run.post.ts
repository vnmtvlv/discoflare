import { and, eq } from 'drizzle-orm'
import { agents, taskDependencies, tasks } from '../../../../drizzle/schema'
import { newId, nowIso, WORKSPACE_ID } from '../../../../shared/ids'
import { Permission } from '../../../../shared/permissions'
import { canRunTask } from '../../../../shared/task-status'
import type { TaskStatus } from '../../../../shared/types'
import { signalTasksChanged } from '../../../../workers/task-events'
import { asRpc } from '../../../../workers/env'
import { requireMember } from '../../../utils/guards'
import { cf, fail } from '../../../utils/cf'
import { getDb } from '../../../utils/db'
import { writeAudit } from '../../../utils/messages'

export default defineEventHandler(async (event) => {
  const actor = await requireMember(event, WORKSPACE_ID, Permission.manageTasks)
  const taskId = getRouterParam(event, 'id')!
  const { env, waitUntil } = cf(event)
  const db = getDb(env.DB)
  const task = (await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1))[0]
  if (!task) fail(404, 'not_found', 'Task not found')
  if (task.archivedAt) fail(409, 'task_archived', 'Restore the task before running it')
  if (task.activeRunId) fail(409, 'already_running', 'Task already has an active run')
  if (!canRunTask(task.status as TaskStatus)) fail(409, 'invalid_status', task.status === 'done' ? 'Reopen the task before running it again' : 'Task is already running')
  if (!task.assigneeId) fail(409, 'unassigned', 'Assign an agent first')
  const agent = (await db.select().from(agents).where(and(eq(agents.userId, task.assigneeId), eq(agents.status, 'active'))).limit(1))[0]
  if (!agent) fail(409, 'agent_unavailable', 'Assigned agent is unavailable')
  const incomplete = await db.select({ id: taskDependencies.dependsOnTaskId }).from(taskDependencies)
    .innerJoin(tasks, eq(tasks.id, taskDependencies.dependsOnTaskId))
    .where(and(eq(taskDependencies.taskId, taskId), eq(tasks.status, 'done')))
  const dependencyCount = await db.select({ id: taskDependencies.dependsOnTaskId }).from(taskDependencies).where(eq(taskDependencies.taskId, taskId))
  if (incomplete.length !== dependencyCount.length) fail(409, 'blocked', 'Complete this task’s dependencies first')

  const runId = newId()
  const createdAt = nowIso()
  const launch = await env.DB.batch([
    env.DB.prepare(
      `UPDATE tasks
       SET active_run_id = ?, last_error = NULL, updated_at = ?
       WHERE id = ? AND status = ? AND active_run_id IS NULL AND archived_at IS NULL
         AND assignee_id = ?
         AND EXISTS (SELECT 1 FROM agents WHERE user_id = ? AND status = 'active')`,
    ).bind(runId, createdAt, taskId, task.status, agent.userId, agent.userId),
    env.DB.prepare(
      `INSERT INTO task_runs (
         id, task_id, agent_id, workflow_id, status, triggered_by,
         title_snapshot, description_snapshot, channel_id_snapshot,
         agent_model_snapshot, agent_instructions_snapshot, task_status_before,
         summary, details, error, progress, started_at, completed_at,
         cancelled_at, cancelled_by, created_at
       )
       SELECT ?, t.id, a.user_id, ?, 'queued', ?,
         t.title, t.description, t.channel_id,
         a.model, a.instructions, t.status,
         NULL, NULL, NULL, NULL, NULL, NULL,
         NULL, NULL, ?
       FROM tasks t JOIN agents a ON a.user_id = t.assignee_id
       WHERE t.id = ? AND t.active_run_id = ? AND a.user_id = ? AND a.status = 'active'`,
    ).bind(runId, runId, actor.user.id, createdAt, taskId, runId, agent.userId),
  ])
  const claim = launch[0]
  const snapshot = launch[1]
  if (!claim || !snapshot || (claim.meta.changes ?? 0) !== 1 || (snapshot.meta.changes ?? 0) !== 1) {
    fail(409, 'already_running', 'Task changed before the run could start')
  }
  try {
    const stub = asRpc<{ startTask: (input: { taskId: string; runId: string }) => Promise<string> }>(env.AGENT_DO.getByName(`agent:${agent.userId}`))
    const workflowId = await stub.startTask({ taskId, runId })
    if (workflowId !== runId) throw new Error('Workflow id does not match its Task Run')
    await writeAudit(env, { workspaceId: WORKSPACE_ID, actorId: actor.user.id, action: 'task.run', targetType: 'task', targetId: taskId, meta: { runId, workflowId, agentId: agent.userId } })
    waitUntil(signalTasksChanged(env, task.boardId, taskId))
    return { run: { id: runId, workflowId, status: 'queued' } }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const failedAt = nowIso()
    await env.DB.batch([
      env.DB.prepare("UPDATE task_runs SET status = 'failed', error = ?, completed_at = ? WHERE id = ?").bind(message, failedAt, runId),
      env.DB.prepare('UPDATE tasks SET active_run_id = NULL, last_error = ?, updated_at = ? WHERE id = ? AND active_run_id = ?').bind(message, failedAt, taskId, runId),
    ])
    await writeAudit(env, { workspaceId: WORKSPACE_ID, actorId: actor.user.id, action: 'task.run_failed', targetType: 'task', targetId: taskId, meta: { runId, error: message } })
    waitUntil(signalTasksChanged(env, task.boardId, taskId))
    fail(503, 'workflow_unavailable', message)
  }
})
