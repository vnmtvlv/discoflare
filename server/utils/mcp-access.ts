import { ALL_PERMISSIONS, hasPermission, type PermissionFlag } from '../../shared/permissions'
import { MCP_SCOPES, type CreatedMcpAccessTokenDTO, type McpAccessTokenDTO, type McpScope } from '../../shared/mcp'
import { newId, nowIso, WORKSPACE_ID } from '../../shared/ids'
import type { DiscoflareEnv } from '../../workers/env'

const TOKEN_PREFIX = 'dfmcp_'
const TOKEN_BYTES = 32

type TokenRow = Omit<McpAccessTokenDTO, 'scopes'> & { scopesJson: string }

export type McpPrincipal = {
  tokenId: string
  userId: string
  workspaceId: string
  roleId: string
  roleName: string
  perms: number
  isOwner: boolean
  scopes: McpScope[]
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return bytesToHex(new Uint8Array(digest))
}

function parseScopes(value: string): McpScope[] {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((scope): scope is McpScope => MCP_SCOPES.includes(scope as McpScope))
  }
  catch {
    return []
  }
}

export async function listMcpAccessTokens(env: DiscoflareEnv): Promise<McpAccessTokenDTO[]> {
  const result = await env.DB.prepare(
    `SELECT id, name, token_prefix as tokenPrefix, scopes_json as scopesJson,
     last_used_at as lastUsedAt, created_at as createdAt
     FROM mcp_access_tokens WHERE revoked_at IS NULL ORDER BY created_at DESC`,
  ).all<TokenRow>()
  return (result.results ?? []).map(({ scopesJson, ...token }) => ({ ...token, scopes: parseScopes(scopesJson) }))
}

export async function issueMcpAccessToken(env: DiscoflareEnv, createdBy: string, name: string): Promise<CreatedMcpAccessTokenDTO> {
  const random = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES))
  const token = `${TOKEN_PREFIX}${bytesToHex(random)}`
  const tokenHash = await hashToken(token)
  const tokenPrefix = token.slice(0, 14)
  const scopes = [...MCP_SCOPES]
  const createdAt = nowIso()
  const id = newId()
  await env.DB.prepare(
    `INSERT INTO mcp_access_tokens
     (id, name, token_hash, token_prefix, scopes_json, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, name, tokenHash, tokenPrefix, JSON.stringify(scopes), createdBy, createdAt, createdAt).run()
  return { id, name, token, tokenPrefix, scopes, lastUsedAt: null, createdAt }
}

export async function revokeMcpAccessToken(env: DiscoflareEnv, id: string): Promise<boolean> {
  const now = nowIso()
  const result = await env.DB.prepare(
    'UPDATE mcp_access_tokens SET revoked_at = ?, updated_at = ? WHERE id = ? AND revoked_at IS NULL',
  ).bind(now, now, id).run()
  return (result.meta.changes ?? 0) > 0
}

export async function authenticateMcpRequest(
  env: DiscoflareEnv,
  request: Request,
  waitUntil?: (promise: Promise<unknown>) => void,
): Promise<McpPrincipal | null> {
  const match = /^Bearer\s+(dfmcp_[0-9a-f]{64})$/i.exec(request.headers.get('authorization') ?? '')
  const token = match?.[1]
  if (!token) return null
  const tokenHash = await hashToken(token)
  const row = await env.DB.prepare(
    `SELECT t.id as tokenId, t.created_by as userId, t.scopes_json as scopesJson,
     r.id as roleId, r.name as roleName, r.permissions_bitmask as perms,
     w.owner_id as ownerId
     FROM mcp_access_tokens t
     JOIN users u ON u.id = t.created_by AND u.status = 'active'
     JOIN roles r ON r.id = u.role_id
     JOIN workspace w ON w.id = ?
     WHERE t.token_hash = ? AND t.revoked_at IS NULL
     LIMIT 1`,
  ).bind(WORKSPACE_ID, tokenHash).first<{
    tokenId: string
    userId: string
    scopesJson: string
    roleId: string
    roleName: string
    perms: number
    ownerId: string
  }>()
  if (!row) return null

  const usedAt = nowIso()
  const touch = env.DB.prepare('UPDATE mcp_access_tokens SET last_used_at = ? WHERE id = ?').bind(usedAt, row.tokenId).run()
  if (waitUntil) waitUntil(touch)
  else await touch

  const isOwner = row.ownerId === row.userId
  return {
    tokenId: row.tokenId,
    userId: row.userId,
    workspaceId: WORKSPACE_ID,
    roleId: row.roleId,
    roleName: row.roleName,
    perms: isOwner ? ALL_PERMISSIONS : row.perms,
    isOwner,
    scopes: parseScopes(row.scopesJson),
  }
}

export function requireMcpAccess(principal: McpPrincipal, scope: McpScope, permission: PermissionFlag): void {
  if (!principal.scopes.includes(scope)) throw new Error(`Access token is missing the ${scope} scope`)
  if (!principal.isOwner && !hasPermission(principal.perms, permission)) throw new Error('The token owner is missing the required workspace permission')
}
