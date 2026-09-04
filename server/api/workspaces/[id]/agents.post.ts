import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { agents, roles, users } from '../../../../drizzle/schema'
import { newId, nowIso } from '../../../../shared/ids'
import { Permission } from '../../../../shared/permissions'
import type { AgentDTO } from '../../../../shared/types'
import { requireMember } from '../../../utils/guards'
import { cf, fail } from '../../../utils/cf'
import { getDb } from '../../../utils/db'
import { writeAudit } from '../../../utils/messages'
import { parseBody } from '../../../utils/validate'

const bodySchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(200).default('@cf/moonshotai/kimi-k2.7-code'),
  instructions: z.string().trim().max(12_000).default(''),
})

export default defineEventHandler(async (event): Promise<{ agent: AgentDTO }> => {
  const workspaceId = getRouterParam(event, 'id')!
  const actor = await requireMember(event, workspaceId, Permission.manageWorkspace)
  const body = parseBody(bodySchema, await readBody(event))
  const { env } = cf(event)
  const db = getDb(env.DB)
  const memberRole = (await db.select().from(roles).where(eq(roles.key, 'member')).limit(1))[0]
  if (!memberRole) fail(409, 'workspace_incomplete', 'Member role not found')

  const id = newId()
  const now = nowIso()
  const sandboxId = `agent-${id}`.toLowerCase()
  await db.batch([
    db.insert(users).values({
      id,
      kind: 'agent',
      handle: null,
      displayName: body.displayName,
      avatarR2Key: null,
      status: 'active',
      roleId: memberRole.id,
      nickname: null,
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(agents).values({
      userId: id,
      model: body.model,
      instructions: body.instructions,
      status: 'active',
      sandboxId,
      createdBy: actor.user.id,
      lastActiveAt: null,
      createdAt: now,
      updatedAt: now,
    }),
  ])
  await writeAudit(env, {
    workspaceId,
    actorId: actor.user.id,
    action: 'agent.create',
    targetType: 'agent',
    targetId: id,
    meta: { displayName: body.displayName, model: body.model },
  })
  return {
    agent: {
      id,
      displayName: body.displayName,
      avatarR2Key: null,
      model: body.model,
      instructions: body.instructions,
      status: 'active',
      sandboxId,
      lastActiveAt: null,
      createdAt: now,
      updatedAt: now,
    },
  }
})
