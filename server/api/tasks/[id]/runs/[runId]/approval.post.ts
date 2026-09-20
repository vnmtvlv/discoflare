import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { taskRuns } from '../../../../../../drizzle/schema'
import { authorize, WorkspaceAction } from '../../../../../../shared/authorization'
import { WORKSPACE_ID } from '../../../../../../shared/ids'
import { Permission } from '../../../../../../shared/permissions'
import { asRpc } from '../../../../../../workers/env'
import { signalTasksChanged } from '../../../../../../workers/task-events'
import { cf, fail } from '../../../../../utils/cf'
import { getDb } from '../../../../../utils/db'
import { requireMember } from '../../../../../utils/guards'
import { writeAudit } from '../../../../../utils/messages'
import { requireTask } from '../../../../../utils/task-policy'
import { parseBody } from '../../../../../utils/validate'

const bodySchema = z.object({
  action: z.enum(['approve', 'reject']),
  executionId: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const actor = await requireMember(event, WORKSPACE_ID, Permission.manageTasks)
  authorize(actor.authorization, WorkspaceAction.approveTaskRun)
  const task = await requireTask(cf(event).env, getRouterParam(event, 'id')!)
  const runId = getRouterParam(event, 'runId')!
  const body = parseBody(bodySchema, await readBody(event))
  const { env, waitUntil } = cf(event)
  const run = (await getDb(env.DB).select().from(taskRuns).where(and(eq(taskRuns.id, runId), eq(taskRuns.taskId, task.id))).limit(1))[0]
  if (!run || run.status !== 'running' || !run.approvalJson) fail(409, 'approval_resolved', 'Approval request is no longer pending')
  const approval = JSON.parse(run.approvalJson) as { executionId?: string }
  if (approval.executionId !== body.executionId) fail(409, 'approval_changed', 'Approval request changed; reload the task')

  const agent = asRpc<{ controlTask: (input: { runId: string; action: 'approve' | 'reject'; executionId: string }) => Promise<void> }>(
    env.AGENT_DO.getByName(`agent:${run.agentId}`),
  )
  await agent.controlTask({ runId, action: body.action, executionId: body.executionId })
  await writeAudit(env, {
    workspaceId: WORKSPACE_ID,
    actorId: actor.user.id,
    action: `task.approval.${body.action}`,
    targetType: 'task_run',
    targetId: runId,
    meta: { taskId: task.id, executionId: body.executionId, agentId: run.agentId },
    authorization: actor.authorization,
  })
  waitUntil(signalTasksChanged(env, task.boardId, task.id))
  return { ok: true }
})
