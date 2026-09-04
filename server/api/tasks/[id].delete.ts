import { eq } from 'drizzle-orm'
import { taskAttachments, tasks } from '../../../drizzle/schema'
import { WORKSPACE_ID } from '../../../shared/ids'
import { Permission } from '../../../shared/permissions'
import { signalTasksChanged } from '../../../workers/task-events'
import { cf, fail } from '../../utils/cf'
import { getDb } from '../../utils/db'
import { requireMember } from '../../utils/guards'
import { writeAudit } from '../../utils/messages'
import { requireTask } from '../../utils/task-policy'

export default defineEventHandler(async (event) => {
  const actor = await requireMember(event, WORKSPACE_ID, Permission.manageTasks)
  const id = getRouterParam(event, 'id')!
  const { env, waitUntil } = cf(event)
  const db = getDb(env.DB)
  const task = await requireTask(env, id)
  if (task.status === 'running') fail(409, 'task_running', 'Cancel the running task before deleting it')
  const attachments = await db.select({ r2Key: taskAttachments.r2Key }).from(taskAttachments).where(eq(taskAttachments.taskId, id))
  await db.delete(tasks).where(eq(tasks.id, id))
  await writeAudit(env, { workspaceId: WORKSPACE_ID, actorId: actor.user.id, action: 'task.delete', targetType: 'task', targetId: id, meta: { boardId: task.boardId, title: task.title } })
  if (attachments.length) waitUntil(Promise.all(attachments.map(item => env.FILES.delete(item.r2Key))))
  waitUntil(signalTasksChanged(env, task.boardId, id))
  return { ok: true }
})
