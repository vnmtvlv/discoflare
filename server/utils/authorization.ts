import { ALL_PERMISSIONS } from '../../shared/permissions'
import type { AuthorizationContext, CredentialKind, WorkspaceAction } from '../../shared/authorization'
import { WORKSPACE_ID } from '../../shared/ids'
import type { McpScope } from '../../shared/mcp'
import type { DiscoflareEnv } from '../../workers/env'

export async function loadAuthorizationContext(
  env: DiscoflareEnv,
  input: {
    principalId: string
    credential: { kind: CredentialKind; id?: string; scopes?: McpScope[] }
    delegatedBy?: string
    taskRunId?: string
    delegatedActions?: WorkspaceAction[]
  },
): Promise<AuthorizationContext | null> {
  const row = await env.DB.prepare(
    `SELECT u.id, u.kind, r.id as roleId, r.name as roleName,
     r.permissions_bitmask as permissions, w.owner_id as ownerId
     FROM users u
     JOIN roles r ON r.id = u.role_id
     JOIN workspace w ON w.id = ?
     WHERE u.id = ? AND u.status = 'active'`,
  ).bind(WORKSPACE_ID, input.principalId).first<{
    id: string
    kind: 'human' | 'agent'
    roleId: string
    roleName: string
    permissions: number
    ownerId: string
  }>()
  if (!row) return null
  const isOwner = row.ownerId === row.id
  return {
    workspaceId: WORKSPACE_ID,
    principal: {
      id: row.id,
      kind: row.kind,
      roleId: row.roleId,
      roleName: row.roleName,
      permissions: isOwner ? ALL_PERMISSIONS : row.permissions,
      isOwner,
    },
    credential: input.credential,
    ...(input.delegatedBy
      ? { delegation: { by: input.delegatedBy, ...(input.taskRunId ? { taskRunId: input.taskRunId } : {}), ...(input.delegatedActions ? { actions: input.delegatedActions } : {}) } }
      : {}),
  }
}
