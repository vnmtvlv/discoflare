import { z } from 'zod'
import { taskBoards } from '../../../../drizzle/schema'
import { newId, nowIso } from '../../../../shared/ids'
import { requireMember } from '../../../utils/guards'
import { cf } from '../../../utils/cf'
import { getDb } from '../../../utils/db'
import { writeAudit } from '../../../utils/messages'
import { parseBody } from '../../../utils/validate'

const bodySchema = z.object({ name: z.string().trim().min(1).max(80) })

export default defineEventHandler(async (event) => {
  const workspaceId = getRouterParam(event, 'id')!
  const actor = await requireMember(event, workspaceId)
  const body = parseBody(bodySchema, await readBody(event))
  const { env } = cf(event)
  const id = newId()
  const now = nowIso()
  const board = { id, name: body.name, position: Date.now() % 1_000_000_000, createdBy: actor.user.id, createdAt: now, updatedAt: now }
  await getDb(env.DB).insert(taskBoards).values(board)
  await writeAudit(env, { workspaceId, actorId: actor.user.id, action: 'board.create', targetType: 'task_board', targetId: id, meta: { name: body.name } })
  return { board: { ...board, tasks: [] } }
})
