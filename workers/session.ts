import type { PublicUser } from '../shared/types'
import type { DiscoflareEnv } from './env'

export type SessionRecord = {
  userId: string
  expiresAt: number
}

export async function userFromSession(env: DiscoflareEnv, token: string): Promise<PublicUser | null> {
  if (!token) return null
  const raw = await env.SESSIONS.get(`session:${token}`)
  if (raw) {
    const rec = JSON.parse(raw) as SessionRecord
    if (rec.expiresAt < Date.now()) return null
    return loadUser(env, rec.userId)
  }
  const ticket = await env.SESSIONS.get(`wsticket:${token}`)
  if (ticket) return loadUser(env, ticket)
  const row = await env.DB.prepare(
    'SELECT user_id, expires_at FROM sessions WHERE id = ?',
  ).bind(token).first<{ user_id: string; expires_at: string }>()
  if (!row) return null
  if (new Date(row.expires_at).getTime() < Date.now()) return null
  return loadUser(env, row.user_id)
}

async function loadUser(env: DiscoflareEnv, userId: string): Promise<PublicUser | null> {
  const row = await env.DB.prepare(
    'SELECT id, email, display_name, avatar_r2_key FROM users WHERE id = ?',
  ).bind(userId).first<{ id: string; email: string; display_name: string; avatar_r2_key: string | null }>()
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarR2Key: row.avatar_r2_key,
  }
}
