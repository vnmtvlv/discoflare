import { and, eq } from 'drizzle-orm'
import { agents, taskRuns, tasks } from '../../../../drizzle/schema'
import { newId, nowIso, WORKSPACE_ID } from '../../../../shared/ids'
import { requireMember } from '../../../utils/guards'
import { cf, fail } from '../../../utils/cf'
import { getDb } from '../../../utils/db'
import { writeAudit } from '../../../utils/messages'
import { asRpc } from '../../../../workers/env'

export default defineEventHandler(async (event) => {
  const actor = await requireMember(event, WORKSPACE_ID)
  const taskId = getRouterParam(event, 'id')!
  const { env } = cf(event)
  const db = getDb(env.DB)
  const task = (await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1))[0]
  if (!task) fail(404, 'not_found', 'Task not found')
  if (!task.assigneeId) fail(409, 'unassigned', 'Assign an agent first')
  if (task.status === 'running') fail(409, 'already_running', 'Task is already running')
  const agent = (await db.select().from(agents).where(and(eq(agents.userId, task.assigneeId), eq(agents.status, 'active'))).limit(1))[0]
  if (!agent) fail(409, 'agent_unavailable', 'Assigned agent is unavailable')

  const runId = newId()
  const createdAt = nowIso()
  const claim = await env.DB.prepare(
    "UPDATE tasks SET status = 'running', last_error = NULL, updated_at = ? WHERE id = ? AND status <> 'running'",
  ).bind(createdAt, taskId).run()
  if ((claim.meta.changes ?? 0) !== 1) fail(409, 'already_running', 'Task is already running')
  try {
    await db.insert(taskRuns).values({ id: runId, taskId, agentId: agent.userId, workflowId: null, status: 'queued', summary: null, details: null, error: null, startedAt: null, completedAt: null, createdAt })
    const stub = asRpc<{ startTask: (input: { taskId: string; runId: string }) => Promise<string> }>(env.AGENT_DO.getByName(`agent:${agent.userId}`))
    const workflowId = await stub.startTask({ taskId, runId })
    await db.update(taskRuns).set({ workflowId }).where(eq(taskRuns.id, runId))
    await writeAudit(env, { workspaceId: WORKSPACE_ID, actorId: actor.user.id, action: 'task.run', targetType: 'task', targetId: taskId, meta: { runId, workflowId, agentId: agent.userId } })
    return { run: { id: runId, workflowId, status: 'queued' } }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const failedAt = nowIso()
    await env.DB.batch([
      env.DB.prepare("UPDATE task_runs SET status = 'failed', error = ?, completed_at = ? WHERE id = ?").bind(message, failedAt, runId),
      env.DB.prepare("UPDATE tasks SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ? AND status = 'running'").bind(message, failedAt, taskId),
    ])
    fail(503, 'workflow_unavailable', message)
  }
})
