import { z } from 'zod'
import { taskDependencies, taskLabelLinks, tasks } from '../../../../drizzle/schema'
import { newId, nowIso, WORKSPACE_ID } from '../../../../shared/ids'
import { Permission } from '../../../../shared/permissions'
import { signalTasksChanged } from '../../../../workers/task-events'
import { requireMember } from '../../../utils/guards'
import { cf } from '../../../utils/cf'
import { getDb } from '../../../utils/db'
import { writeAudit } from '../../../utils/messages'
import { parseBody } from '../../../utils/validate'
import { nextTaskPosition, requireBoard, validateTaskAgent, validateTaskChannel, validateTaskDependencies, validateTaskLabels } from '../../../utils/task-policy'

const bodySchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(12_000).default(''),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  dueAt: z.string().refine(value => !Number.isNaN(Date.parse(value)), 'Invalid due date').nullable().default(null),
  assigneeId: z.string().min(8).nullable().default(null),
  channelId: z.string().min(8).nullable().default(null),
  labelIds: z.array(z.string().min(8)).max(20).default([]),
  dependencyIds: z.array(z.string().min(8)).max(100).default([]),
})

export default defineEventHandler(async (event) => {
  const boardId = getRouterParam(event, 'id')!
  const actor = await requireMember(event, WORKSPACE_ID, Permission.manageTasks)
  const body = parseBody(bodySchema, await readBody(event))
  const { env, waitUntil } = cf(event)
  const db = getDb(env.DB)
  await Promise.all([
    requireBoard(env, boardId),
    validateTaskAgent(env, body.assigneeId),
    validateTaskChannel(env, body.channelId),
    validateTaskLabels(env, boardId, body.labelIds),
    validateTaskDependencies(env, null, boardId, body.dependencyIds),
  ])
  const id = newId()
  const now = nowIso()
  const task = {
    id,
    boardId,
    title: body.title,
    description: body.description,
    status: body.assigneeId ? 'ready' as const : 'backlog' as const,
    priority: body.priority,
    dueAt: body.dueAt,
    position: await nextTaskPosition(env, boardId, body.assigneeId ? 'ready' : 'backlog'),
    assigneeId: body.assigneeId,
    channelId: body.channelId,
    createdBy: actor.user.id,
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
    ...[...new Set(body.labelIds)].map(labelId => db.insert(taskLabelLinks).values({ taskId: id, labelId })),
    ...[...new Set(body.dependencyIds)].map(dependsOnTaskId => db.insert(taskDependencies).values({ taskId: id, dependsOnTaskId, createdAt: now })),
  ])
  await writeAudit(env, { workspaceId: WORKSPACE_ID, actorId: actor.user.id, action: 'task.create', targetType: 'task', targetId: id, meta: { boardId, assigneeId: body.assigneeId } })
  waitUntil(signalTasksChanged(env, boardId, id))
  return { task: { ...task, labels: [], checklistTotal: 0, checklistCompleted: 0, dependencyIds: body.dependencyIds, attachmentCount: 0, latestRun: null } }
})
