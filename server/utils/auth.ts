import { bytesToHex, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import { sha256 } from '@noble/hashes/sha2.js'
import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { SESSION_COOKIE } from '../../workers/env'
import { sessions, users } from '../../drizzle/schema'
import type { PublicUser } from '../../shared/types'
import { nowIso } from '../../shared/ids'
import { authFromEvent } from './better-auth'
import { cf, fail } from './cf'
import { getDb } from './db'

const SESSION_MS = 30 * 24 * 60 * 60 * 1000

export function publicUser(row: { id: string; email: string; displayName: string; avatarR2Key: string | null }): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    avatarR2Key: row.avatarR2Key,
  }
}

export function hashUa(ua: string): string {
  return bytesToHex(sha256(utf8ToBytes(ua || 'unknown')))
}

export async function createSession(event: H3Event, userId: string): Promise<string> {
  const { env } = cf(event)
  const db = getDb(env.DB)
  const id = bytesToHex(randomBytes(32))
  const created = nowIso()
  const expiresAt = new Date(Date.now() + SESSION_MS).toISOString()
  const ua = hashUa(getHeader(event, 'user-agent') || '')
  await db.insert(sessions).values({
    id,
    userId,
    createdAt: created,
    expiresAt,
    userAgentHash: ua,
  })
  await env.SESSIONS.put(`session:${id}`, JSON.stringify({ userId, expiresAt: Date.now() + SESSION_MS }), {
    expirationTtl: Math.floor(SESSION_MS / 1000),
  })
  setCookie(event, SESSION_COOKIE, id, {
    httpOnly: true,
    secure: !import.meta.dev,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_MS / 1000),
  })
  return id
}

export async function destroySession(event: H3Event): Promise<void> {
  const token = getCookie(event, SESSION_COOKIE)
  if (token) {
    const { env } = cf(event)
    const db = getDb(env.DB)
    await env.SESSIONS.delete(`session:${token}`)
    await db.delete(sessions).where(eq(sessions.id, token))
  }
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
}

export async function currentUser(event: H3Event): Promise<PublicUser | null> {
  const { env } = cf(event)
  const db = getDb(env.DB)
  try {
    const sess = await authFromEvent(event).api.getSession({ headers: event.headers })
    if (sess?.user?.id) {
      const row = (await db.select().from(users).where(eq(users.id, sess.user.id)).limit(1))[0]
      if (row) return publicUser(row)
      const created = nowIso()
      await db.insert(users).values({
        id: sess.user.id,
        email: sess.user.email,
        passwordHash: 'delegated',
        displayName: sess.user.name || sess.user.email.split('@')[0] || 'member',
        avatarR2Key: sess.user.image ?? null,
        createdAt: created,
      })
      return {
        id: sess.user.id,
        email: sess.user.email,
        displayName: sess.user.name || 'member',
        avatarR2Key: sess.user.image ?? null,
      }
    }
  }
  catch {
    // fall through to legacy cookie
  }

  const token = getCookie(event, SESSION_COOKIE)
  if (!token) return null
  const kv = await env.SESSIONS.get(`session:${token}`)
  let userId: string | null = null
  if (kv) {
    const rec = JSON.parse(kv) as { userId: string; expiresAt: number }
    if (rec.expiresAt > Date.now()) userId = rec.userId
  }
  else {
    const row = (await db.select().from(sessions).where(eq(sessions.id, token)).limit(1))[0]
    if (row && new Date(row.expiresAt).getTime() > Date.now()) userId = row.userId
  }
  if (!userId) return null
  const profile = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0]
  if (!profile) return null
  return publicUser(profile)
}

export async function requireUser(event: H3Event): Promise<PublicUser> {
  const user = await currentUser(event)
  if (!user) fail(401, 'unauthorized', 'Login required')
  return user
}

export async function issueWsTicket(event: H3Event, userId: string): Promise<string> {
  const { env } = cf(event)
  const token = bytesToHex(randomBytes(24))
  await env.SESSIONS.put(`wsticket:${token}`, userId, { expirationTtl: 120 })
  return token
}
