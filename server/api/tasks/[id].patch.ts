import { eq, or } from 'drizzle-orm'
import { z } from 'zod'
import { taskDependencies, taskLabelLinks, tasks } from '../../../drizzle/schema'
import { nowIso, WORKSPACE_ID } from '../../../shared/ids'
import { Permission } from '../../../shared/permissions'
import { canSetTaskStatus } from '../../../shared/task-status'
import type { TaskStatus } from '../../../shared/types'
import { signalTasksChanged } from '../../../workers/task-events'
import { cf, fail } from '../../utils/cf'
import { getDb } from '../../utils/db'
import { requireMember } from '../../utils/guards'
import { writeAudit } from '../../utils/messages'
import { loadTaskDetail } from '../../utils/task-data'
import { nextTaskPosition, requireBoard, requireTask, validateTaskAgent, validateTaskChannel, validateTaskDependencies, validateTaskLabels } from '../../utils/task-policy'
import { parseBody } from '../../utils/validate'

const bodySchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(12_000).optional(),
  status: z.enum(['backlog', 'ready', 'review', 'done', 'failed']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  dueAt: z.string().refine(value => !Number.isNaN(Date.parse(value)), 'Invalid due date').nullable().optional(),
  position: z.number().int().min(0).optional(),
  boardId: z.string().min(8).optional(),
  assigneeId: z.string().min(8).nullable().optional(),
  channelId: z.string().min(8).nullable().optional(),
  archived: z.boolean().optional(),
  labelIds: z.array(z.string().min(8)).max(20).optional(),
  dependencyIds: z.array(z.string().min(8)).max(100).optional(),
}).refine(body => Object.keys(body).length > 0, 'No changes')

export default defineEventHandler(async (event) => {
  const actor = await requireMember(event, WORKSPACE_ID, Permission.manageTasks)
  const id = getRouterParam(event, 'id')!
  const body = parseBody(bodySchema, await readBody(event))
  const { env, waitUntil } = cf(event)
  const db = getDb(env.DB)
  const task = await requireTask(env, id)
  if (task.status === 'running') fail(409, 'task_running', 'Cancel the running task before changing it')
  if (body.status && !canSetTaskStatus(task.status as TaskStatus, body.status)) fail(409, 'invalid_status', 'Task status can only enter running through a run')

  const boardId = body.boardId ?? task.boardId
  await Promise.all([
    body.boardId ? requireBoard(env, body.boardId) : Promise.resolve(),
    validateTaskAgent(env, body.assigneeId),
    validateTaskChannel(env, body.channelId),
    validateTaskLabels(env, boardId, body.labelIds),
    validateTaskDependencies(env, id, boardId, body.dependencyIds),
  ])

  let status = body.status ?? task.status
  if (body.status === undefined && body.assigneeId !== undefined) {
    if (body.assigneeId === null) status = 'backlog'
    else if (task.status === 'backlog') status = 'ready'
  }
  const position = body.position ?? (body.boardId || body.status ? await nextTaskPosition(env, boardId, status as TaskStatus) : task.position)
  const updatedAt = nowIso()
  const patch: Partial<typeof tasks.$inferInsert> = {
    title: body.title ?? task.title,
    description: body.description ?? task.description,
    status: status as TaskStatus,
    priority: body.priority ?? task.priority,
    dueAt: body.dueAt === undefined ? task.dueAt : body.dueAt,
    position,
    boardId,
    assigneeId: body.assigneeId === undefined ? task.assigneeId : body.assigneeId,
    channelId: body.channelId === undefined ? task.channelId : body.channelId,
    archivedAt: body.archived === undefined ? task.archivedAt : body.archived ? updatedAt : null,
    lastError: status === 'failed' ? task.lastError : null,
    updatedAt,
  }

  await db.update(tasks).set(patch).where(eq(tasks.id, id))
  if (body.boardId && body.boardId !== task.boardId) {
    await db.batch([
      db.delete(taskLabelLinks).where(eq(taskLabelLinks.taskId, id)),
      db.delete(taskDependencies).where(or(eq(taskDependencies.taskId, id), eq(taskDependencies.dependsOnTaskId, id))),
    ])
  }
  if (body.labelIds !== undefined) {
    await db.delete(taskLabelLinks).where(eq(taskLabelLinks.taskId, id))
    const labelIds = [...new Set(body.labelIds)]
    if (labelIds.length) await db.insert(taskLabelLinks).values(labelIds.map(labelId => ({ taskId: id, labelId })))
  }
  if (body.dependencyIds !== undefined) {
    await db.delete(taskDependencies).where(eq(taskDependencies.taskId, id))
    const dependencyIds = [...new Set(body.dependencyIds)]
    if (dependencyIds.length) await db.insert(taskDependencies).values(dependencyIds.map(dependsOnTaskId => ({ taskId: id, dependsOnTaskId, createdAt: updatedAt })))
  }
  await writeAudit(env, {
    workspaceId: WORKSPACE_ID,
    actorId: actor.user.id,
    action: body.archived === true ? 'task.archive' : body.archived === false ? 'task.restore' : 'task.update',
    targetType: 'task',
    targetId: id,
    meta: { fields: Object.keys(body), fromBoardId: task.boardId, toBoardId: boardId, fromStatus: task.status, toStatus: status },
  })
  waitUntil(signalTasksChanged(env, boardId, id))
  if (boardId !== task.boardId) waitUntil(signalTasksChanged(env, task.boardId, id))
  return { task: await loadTaskDetail(env, id) }
})
