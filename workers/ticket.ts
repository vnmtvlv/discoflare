import type { PublicUser } from '../shared/types'
import type { DiscoflareEnv } from './env'

export async function userFromTicket(env: DiscoflareEnv, token: string): Promise<PublicUser | null> {
  if (!token) return null
  const ticket = await env.TICKETS.get(`wsticket:${token}`)
  if (ticket) {
    await env.TICKETS.delete(`wsticket:${token}`)
    return loadUser(env, ticket)
  }
  return null
}

async function loadUser(env: DiscoflareEnv, userId: string): Promise<PublicUser | null> {
  const row = await env.DB.prepare(
    "SELECT id, kind, display_name, avatar_r2_key FROM users WHERE id = ? AND status = 'active'",
  ).bind(userId).first<{ id: string; kind: 'human' | 'agent'; display_name: string; avatar_r2_key: string | null }>()
  if (!row) return null
  return {
    id: row.id,
    kind: row.kind,
    displayName: row.display_name,
    avatarR2Key: row.avatar_r2_key,
  }
}
