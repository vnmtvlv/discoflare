import { z } from 'zod'
import { agents, channels, taskBoards, tasks } from '../../../../drizzle/schema'
import { newId, nowIso, WORKSPACE_ID } from '../../../../shared/ids'
import { requireMember } from '../../../utils/guards'
import { cf, fail } from '../../../utils/cf'
import { getDb } from '../../../utils/db'
import { writeAudit } from '../../../utils/messages'
import { parseBody } from '../../../utils/validate'
import { and, eq } from 'drizzle-orm'

const bodySchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(12_000).default(''),
  assigneeId: z.string().min(8).nullable().default(null),
  channelId: z.string().min(8).nullable().default(null),
})

export default defineEventHandler(async (event) => {
  const boardId = getRouterParam(event, 'id')!
  const actor = await requireMember(event, WORKSPACE_ID)
  const body = parseBody(bodySchema, await readBody(event))
  const { env } = cf(event)
  const db = getDb(env.DB)
  if (!(await db.select({ id: taskBoards.id }).from(taskBoards).where(eq(taskBoards.id, boardId)).limit(1))[0]) {
    fail(404, 'not_found', 'Board not found')
  }
  if (body.assigneeId && !(await db.select({ id: agents.userId }).from(agents).where(and(eq(agents.userId, body.assigneeId), eq(agents.status, 'active'))).limit(1))[0]) {
    fail(400, 'bad_request', 'Active agent not found')
  }
  if (body.channelId && !(await db.select({ id: channels.id }).from(channels).where(and(eq(channels.id, body.channelId), eq(channels.type, 'text'), eq(channels.visibility, 'workspace'))).limit(1))[0]) {
    fail(400, 'bad_request', 'Public text report channel not found')
  }
  const id = newId()
  const now = nowIso()
  const task = {
    id,
    boardId,
    title: body.title,
    description: body.description,
    status: body.assigneeId ? 'ready' as const : 'backlog' as const,
    position: Date.now() % 1_000_000_000,
    assigneeId: body.assigneeId,
    channelId: body.channelId,
    createdBy: actor.user.id,
    resultSummary: null,
    resultDetails: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  }
  await db.insert(tasks).values(task)
  await writeAudit(env, { workspaceId: WORKSPACE_ID, actorId: actor.user.id, action: 'task.create', targetType: 'task', targetId: id, meta: { boardId, assigneeId: body.assigneeId } })
  return { task: { ...task, latestRun: null } }
})
