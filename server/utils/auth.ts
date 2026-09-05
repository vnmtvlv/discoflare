import { bytesToHex, randomBytes } from '@noble/hashes/utils.js'
import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { roles, users } from '../../drizzle/schema'
import type { PublicUser, SessionUser } from '../../shared/types'
import { nowIso } from '../../shared/ids'
import { authFromEvent } from './better-auth'
import { loadAuthRuntimeConfig } from './auth-config'
import { cf, fail } from './cf'
import { getDb } from './db'
import { writeAudit } from './messages'
import { signalMembersChanged } from '../../workers/member-events'
import {
  consumeSocialOnboardingTicket,
  hasAcceptedCurrentOnboarding,
  loadCurrentOnboarding,
  recordOnboardingAcceptance,
} from './onboarding'

type AuthIdentity = { id: string; email: string; name: string; image?: string | null }

export function visibleAuthEmail(email: string): string | null {
  return email.endsWith('@identity.discoflare.invalid') ? null : email
}

export async function ensureDomainUser(event: H3Event, identity: AuthIdentity) {
  const { env, waitUntil } = cf(event)
  const db = getDb(env.DB)
  let row = (await db.select().from(users).where(eq(users.id, identity.id)).limit(1))[0]
  if (row) return row

  const [runtime, onboarding] = await Promise.all([
    loadAuthRuntimeConfig(env, getRequestURL(event).origin),
    loadCurrentOnboarding(env),
  ])
  const socialRevisionId = await consumeSocialOnboardingTicket(event)
  if (socialRevisionId && socialRevisionId === onboarding.revisionId) {
    await recordOnboardingAcceptance(env, identity.id, socialRevisionId)
  }
  const accepted = await hasAcceptedCurrentOnboarding(env, identity.id, onboarding)
  const memberRole = runtime.registrationMode === 'open' && accepted
    ? (await db.select().from(roles).where(eq(roles.key, 'member')).limit(1))[0]
    : null
  const created = nowIso()
  const active = Boolean(memberRole)
  await db.insert(users).values({
    id: identity.id,
    displayName: identity.name || visibleAuthEmail(identity.email)?.split('@')[0] || 'member',
    avatarR2Key: identity.image ?? null,
    status: active ? 'active' : 'pending',
    roleId: memberRole?.id ?? null,
    nickname: null,
    joinedAt: active ? created : null,
    createdAt: created,
    updatedAt: created,
  }).onConflictDoNothing()
  row = (await db.select().from(users).where(eq(users.id, identity.id)).limit(1))[0]!
  if (active) {
    await writeAudit(env, {
      workspaceId: 'main',
      actorId: identity.id,
      action: 'member.join',
      targetType: 'user',
      targetId: identity.id,
      meta: { admission: 'open' },
    })
    waitUntil(signalMembersChanged(env, 'main'))
  }
  return row
}

export function publicUser(row: { id: string; kind: 'human' | 'agent'; displayName: string; avatarR2Key: string | null }): PublicUser {
  return {
    id: row.id,
    kind: row.kind,
    displayName: row.displayName,
    avatarR2Key: row.avatarR2Key,
  }
}

export async function sessionUser(
  event: H3Event,
  row: typeof users.$inferSelect,
  email: string | null,
): Promise<SessionUser> {
  const { env } = cf(event)
  return {
    ...publicUser(row),
    email,
    status: row.status,
    onboardingRequired: row.status === 'pending' && !(await hasAcceptedCurrentOnboarding(env, row.id)),
  }
}

export async function activateOpenMember(event: H3Event, userId: string) {
  const { env, waitUntil } = cf(event)
  const runtime = await loadAuthRuntimeConfig(env, getRequestURL(event).origin)
  if (runtime.registrationMode !== 'open') return
  if (!(await hasAcceptedCurrentOnboarding(env, userId))) return
  const db = getDb(env.DB)
  const row = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0]
  if (!row || row.status !== 'pending') return
  const memberRole = (await db.select().from(roles).where(eq(roles.key, 'member')).limit(1))[0]
  if (!memberRole) fail(500, 'internal', 'Member role missing')
  const joinedAt = nowIso()
  await db.update(users).set({
    status: 'active',
    roleId: memberRole.id,
    joinedAt,
    updatedAt: joinedAt,
  }).where(eq(users.id, userId))
  await writeAudit(env, {
    workspaceId: 'main',
    actorId: userId,
    action: 'member.join',
    targetType: 'user',
    targetId: userId,
    meta: { admission: 'open', onboarding: true },
  })
  waitUntil(signalMembersChanged(env, 'main'))
}

export async function currentUser(event: H3Event): Promise<SessionUser | null> {
  const { env } = cf(event)
  const db = getDb(env.DB)
  const auth = await authFromEvent(event)
  const sess = await auth.api.getSession({ headers: event.headers })
  if (sess?.user?.id) {
    const row = (await db.select().from(users).where(eq(users.id, sess.user.id)).limit(1))[0]
    if (row) return sessionUser(event, row, visibleAuthEmail(sess.user.email))
    const createdRow = await ensureDomainUser(event, sess.user)
    return sessionUser(event, createdRow, visibleAuthEmail(sess.user.email))
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
