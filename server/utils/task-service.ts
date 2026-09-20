import { eq, or } from 'drizzle-orm'
import { taskDependencies, taskLabelLinks, tasks } from '../../drizzle/schema'
import { newId, nowIso, WORKSPACE_ID } from '../../shared/ids'
import { canSetTaskStatus } from '../../shared/task-status'
import type { TaskBoardDTO, TaskDetailDTO, TaskPriority, TaskStatus } from '../../shared/types'
import type { DiscoflareEnv } from '../../workers/env'
import { signalTasksChanged } from '../../workers/task-events'
import { fail } from './cf'
import { getDb } from './db'
import { writeAudit } from './messages'
import { authorize, WorkspaceAction, type AuthorizationContext } from '../../shared/authorization'
import { loadTaskBoards, loadTaskDetail } from './task-data'
import { nextTaskPosition, requireBoard, requireTask, validateTaskAgent, validateTaskChannel, validateTaskDependencies, validateTaskLabels } from './task-policy'

type Schedule = (promise: Promise<unknown>) => void

export type CreateTaskInput = {
  title: string
  description: string
  priority: TaskPriority
  dueAt: string | null
  assigneeId: string | null
  channelId: string | null
  labelIds: string[]
  dependencyIds: string[]
}

export type UpdateTaskInput = {
  title?: string
  description?: string
  status?: Exclude<TaskStatus, 'running'>
  priority?: TaskPriority
  dueAt?: string | null
  position?: number
  boardId?: string
  assigneeId?: string | null
  channelId?: string | null
  archived?: boolean
  labelIds?: string[]
  dependencyIds?: string[]
}

export async function listTasks(
  env: DiscoflareEnv,
  authorization: AuthorizationContext,
  includeArchived = false,
): Promise<TaskBoardDTO[]> {
  authorize(authorization, WorkspaceAction.readTasks)
  return loadTaskBoards(env, includeArchived)
}

export async function getTask(
  env: DiscoflareEnv,
  authorization: AuthorizationContext,
  taskReference: string | number,
): Promise<TaskDetailDTO | null> {
  authorize(authorization, WorkspaceAction.readTasks)
  return loadTaskDetail(env, taskReference)
}

export async function createTask(
  env: DiscoflareEnv,
  authorization: AuthorizationContext,
  boardId: string,
  input: CreateTaskInput,
  schedule: Schedule,
): Promise<TaskDetailDTO> {
  authorize(authorization, WorkspaceAction.writeTasks)
  const actorId = authorization.principal.id
  const db = getDb(env.DB)
  await Promise.all([
    requireBoard(env, boardId),
    validateTaskAgent(env, input.assigneeId),
    validateTaskChannel(env, input.channelId),
    validateTaskLabels(env, boardId, input.labelIds),
    validateTaskDependencies(env, null, boardId, input.dependencyIds),
  ])
  const id = newId()
  const now = nowIso()
  const status = input.assigneeId ? 'ready' as const : 'backlog' as const
  const task = {
    id,
    boardId,
    title: input.title,
    description: input.description,
    status,
    priority: input.priority,
    dueAt: input.dueAt,
    position: await nextTaskPosition(env, boardId, status),
    assigneeId: input.assigneeId,
    channelId: input.channelId,
    createdBy: actorId,
    resultSummary: null,
    resultDetails: null,
    lastError: null,
    activeRunId: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  }
  await db.batch([
    db.insert(tasks).values(task),
    ...[...new Set(input.labelIds)].map(labelId => db.insert(taskLabelLinks).values({ taskId: id, labelId })),
    ...[...new Set(input.dependencyIds)].map(dependsOnTaskId => db.insert(taskDependencies).values({ taskId: id, dependsOnTaskId, createdAt: now })),
  ])
  await writeAudit(env, { workspaceId: WORKSPACE_ID, actorId, action: 'task.create', targetType: 'task', targetId: id, meta: { boardId, assigneeId: input.assigneeId }, authorization })
  schedule(signalTasksChanged(env, boardId, id))
  return (await loadTaskDetail(env, id))!
}

export async function updateTask(
  env: DiscoflareEnv,
  authorization: AuthorizationContext,
  taskReference: string | number,
  input: UpdateTaskInput,
  schedule: Schedule,
): Promise<TaskDetailDTO> {
  authorize(authorization, WorkspaceAction.writeTasks)
  const actorId = authorization.principal.id
  const db = getDb(env.DB)
  const task = await requireTask(env, taskReference)
  const id = task.id
  if (task.status === 'running') fail(409, 'task_running', 'Cancel the running task before changing it')
  if (input.status && !canSetTaskStatus(task.status as TaskStatus, input.status)) fail(409, 'invalid_status', 'Task status can only enter running through a run')

  const boardId = input.boardId ?? task.boardId
  await Promise.all([
    input.boardId ? requireBoard(env, input.boardId) : Promise.resolve(),
    validateTaskAgent(env, input.assigneeId),
    validateTaskChannel(env, input.channelId),
    validateTaskLabels(env, boardId, input.labelIds),
    validateTaskDependencies(env, id, boardId, input.dependencyIds),
  ])

  let status = input.status ?? task.status
  if (input.status === undefined && input.assigneeId !== undefined) {
    if (input.assigneeId === null) status = 'backlog'
    else if (task.status === 'backlog') status = 'ready'
  }
  const position = input.position ?? (input.boardId || input.status ? await nextTaskPosition(env, boardId, status as TaskStatus) : task.position)
  const updatedAt = nowIso()
  const patch: Partial<typeof tasks.$inferInsert> = {
    title: input.title ?? task.title,
    description: input.description ?? task.description,
    status: status as TaskStatus,
    priority: input.priority ?? task.priority,
    dueAt: input.dueAt === undefined ? task.dueAt : input.dueAt,
    position,
    boardId,
    assigneeId: input.assigneeId === undefined ? task.assigneeId : input.assigneeId,
    channelId: input.channelId === undefined ? task.channelId : input.channelId,
    archivedAt: input.archived === undefined ? task.archivedAt : input.archived ? updatedAt : null,
    lastError: status === 'failed' ? task.lastError : null,
    updatedAt,
  }

  await db.update(tasks).set(patch).where(eq(tasks.id, id))
  if (input.boardId && input.boardId !== task.boardId) {
    await db.batch([
      db.delete(taskLabelLinks).where(eq(taskLabelLinks.taskId, id)),
      db.delete(taskDependencies).where(or(eq(taskDependencies.taskId, id), eq(taskDependencies.dependsOnTaskId, id))),
    ])
  }
  if (input.labelIds !== undefined) {
    await db.delete(taskLabelLinks).where(eq(taskLabelLinks.taskId, id))
    const labelIds = [...new Set(input.labelIds)]
    if (labelIds.length) await db.insert(taskLabelLinks).values(labelIds.map(labelId => ({ taskId: id, labelId })))
  }
  if (input.dependencyIds !== undefined) {
    await db.delete(taskDependencies).where(eq(taskDependencies.taskId, id))
    const dependencyIds = [...new Set(input.dependencyIds)]
    if (dependencyIds.length) await db.insert(taskDependencies).values(dependencyIds.map(dependsOnTaskId => ({ taskId: id, dependsOnTaskId, createdAt: updatedAt })))
  }
  await writeAudit(env, {
    workspaceId: WORKSPACE_ID,
    actorId,
    action: input.archived === true ? 'task.archive' : input.archived === false ? 'task.restore' : 'task.update',
    targetType: 'task',
    targetId: id,
    meta: { fields: Object.keys(input), fromBoardId: task.boardId, toBoardId: boardId, fromStatus: task.status, toStatus: status },
    authorization,
  })
  schedule(signalTasksChanged(env, boardId, id))
  if (boardId !== task.boardId) schedule(signalTasksChanged(env, task.boardId, id))
  return (await loadTaskDetail(env, id))!
}

/** Narrow Agent capability: update only its own assigned, non-running task result. */
export async function updateAssignedTaskResult(
  env: DiscoflareEnv,
  authorization: AuthorizationContext,
  taskId: string,
  input: { status: Exclude<TaskStatus, 'running'>; summary?: string; details?: string },
  schedule: Schedule,
): Promise<{ updated: boolean }> {
  authorize(authorization, WorkspaceAction.writeTasks)
  const actorId = authorization.principal.id
  const current = await env.DB.prepare(
    "SELECT board_id as boardId, status FROM tasks WHERE id = ? AND assignee_id = ? AND status <> 'running'",
  ).bind(taskId, actorId).first<{ boardId: string; status: TaskStatus }>()
  if (!current) return { updated: false }
  if (!canSetTaskStatus(current.status, input.status)) return { updated: false }

  const result = await env.DB.prepare(
    `UPDATE tasks SET status = ?, result_summary = coalesce(?, result_summary),
     result_details = coalesce(?, result_details), updated_at = ?
     WHERE id = ? AND assignee_id = ? AND status <> 'running'`,
  ).bind(input.status, input.summary ?? null, input.details ?? null, nowIso(), taskId, actorId).run()
  const updated = (result.meta.changes ?? 0) > 0
  if (updated) {
    await writeAudit(env, {
      workspaceId: WORKSPACE_ID,
      actorId,
      action: 'task.update',
      targetType: 'task',
      targetId: taskId,
      meta: { fields: ['status', 'result'], status: input.status },
      authorization,
    })
    schedule(signalTasksChanged(env, current.boardId, taskId))
  }
  return { updated }
}
