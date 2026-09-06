import { z } from 'zod'
import { WORKSPACE_ID } from '../../../../shared/ids'
import { cf, fail } from '../../../utils/cf'
import { requireMember } from '../../../utils/guards'
import { issueMcpAccessToken } from '../../../utils/mcp-access'
import { writeAudit } from '../../../utils/messages'
import { parseBody } from '../../../utils/validate'

const bodySchema = z.object({ name: z.string().trim().min(1).max(80) })

export default defineEventHandler(async (event) => {
  const workspaceId = getRouterParam(event, 'id')!
  if (workspaceId !== WORKSPACE_ID) fail(404, 'not_found', 'Workspace not found')
  const actor = await requireMember(event, workspaceId)
  if (!actor.isOwner) fail(403, 'forbidden', 'Only the workspace owner can manage MCP access tokens')
  const body = parseBody(bodySchema, await readBody(event))
  const { env } = cf(event)
  const token = await issueMcpAccessToken(env, actor.user.id, body.name)
  await writeAudit(env, {
    workspaceId,
    actorId: actor.user.id,
    action: 'mcp_token.create',
    targetType: 'mcp_token',
    targetId: token.id,
    meta: { name: token.name, scopes: token.scopes },
  })
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return { token }
})
