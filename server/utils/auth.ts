import { bytesToHex, randomBytes } from '@noble/hashes/utils.js'
import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { users } from '../../drizzle/schema'
import type { PublicUser, SessionUser } from '../../shared/types'
import { nowIso } from '../../shared/ids'
import { authFromEvent } from './better-auth'
import { cf, fail } from './cf'
import { getDb } from './db'

export function publicUser(row: { id: string; displayName: string; avatarR2Key: string | null }): PublicUser {
  return {
    id: row.id,
    displayName: row.displayName,
    avatarR2Key: row.avatarR2Key,
  }
}

export async function currentUser(event: H3Event): Promise<SessionUser | null> {
  const { env } = cf(event)
  const db = getDb(env.DB)
  const sess = await authFromEvent(event).api.getSession({ headers: event.headers })
  if (sess?.user?.id) {
    const row = (await db.select().from(users).where(eq(users.id, sess.user.id)).limit(1))[0]
    if (row) return { ...publicUser(row), email: sess.user.email }
    const created = nowIso()
    await db.insert(users).values({
      id: sess.user.id,
      displayName: sess.user.name || sess.user.email.split('@')[0] || 'member',
      avatarR2Key: sess.user.image ?? null,
      status: 'pending',
      roleId: null,
      nickname: null,
      joinedAt: null,
      createdAt: created,
    })
    return {
      id: sess.user.id,
      displayName: sess.user.name || 'member',
      avatarR2Key: sess.user.image ?? null,
      email: sess.user.email,
    }
  }
  return null
}

export async function requireUser(event: H3Event): Promise<SessionUser> {
  const user = await currentUser(event)
  if (!user) fail(401, 'unauthorized', 'Login required')
  return user
}

export async function issueWsTicket(event: H3Event, userId: string): Promise<string> {
  const { env } = cf(event)
  const token = bytesToHex(randomBytes(24))
  await env.TICKETS.put(`wsticket:${token}`, userId, { expirationTtl: 120 })
  return token
}
