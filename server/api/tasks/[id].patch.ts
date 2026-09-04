import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { agents, tasks } from '../../../drizzle/schema'
import { nowIso, WORKSPACE_ID } from '../../../shared/ids'
import { requireMember } from '../../utils/guards'
import { cf, fail } from '../../utils/cf'
import { getDb } from '../../utils/db'
import { parseBody } from '../../utils/validate'

const bodySchema = z.object({
  status: z.enum(['backlog', 'ready', 'review', 'done', 'failed']).optional(),
  assigneeId: z.string().min(8).nullable().optional(),
}).refine(body => body.status !== undefined || body.assigneeId !== undefined, 'No changes')

export default defineEventHandler(async (event) => {
  await requireMember(event, WORKSPACE_ID)
  const id = getRouterParam(event, 'id')!
  const body = parseBody(bodySchema, await readBody(event))
  const { env } = cf(event)
  const db = getDb(env.DB)
  const task = (await db.select().from(tasks).where(eq(tasks.id, id)).limit(1))[0]
  if (!task) fail(404, 'not_found', 'Task not found')
  if (task.status === 'running') fail(409, 'task_running', 'Running task cannot be changed')
  if (body.assigneeId && !(await db.select({ id: agents.userId }).from(agents).where(and(eq(agents.userId, body.assigneeId), eq(agents.status, 'active'))).limit(1))[0]) {
    fail(400, 'bad_request', 'Active agent not found')
  }
  const status = body.status ?? (body.assigneeId === null ? 'backlog' : body.assigneeId ? 'ready' : task.status)
  await db.update(tasks).set({
    status,
    assigneeId: body.assigneeId === undefined ? task.assigneeId : body.assigneeId,
    updatedAt: nowIso(),
  }).where(eq(tasks.id, id))
  return { ok: true }
})
