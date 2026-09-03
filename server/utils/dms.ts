import { and, eq, inArray } from 'drizzle-orm'
import { channels, channelMembers, users } from '../../drizzle/schema'
import { dmTitle } from '../../shared/dm'
import { newId, nowIso, WORKSPACE_ID } from '../../shared/ids'
import type { ChannelDTO, PublicUser } from '../../shared/types'
import type { DiscoflareEnv } from '../../workers/env'
import { asRpc } from './cf'
import { getDb } from './db'
import { toPublicUser } from './messages'

export async function loadParticipants(env: DiscoflareEnv, channelId: string): Promise<PublicUser[]> {
  const db = getDb(env.DB)
  const parts = await db.select().from(channelMembers).where(eq(channelMembers.channelId, channelId))
  if (!parts.length) return []
  const rows = await db.select().from(users).where(inArray(users.id, parts.map((p) => p.userId)))
  return rows.map(toPublicUser)
}

export async function dmFrozen(env: DiscoflareEnv, participantIds: string[]): Promise<boolean> {
  const db = getDb(env.DB)
  const rows = await db.select({ userId: users.id }).from(users)
    .where(and(inArray(users.id, participantIds), eq(users.status, 'active')))
  return rows.length !== participantIds.length
}

export async function toDmDto(
  env: DiscoflareEnv,
  ch: typeof channels.$inferSelect,
  meId: string,
  unread: boolean,
): Promise<ChannelDTO> {
  const participants = await loadParticipants(env, ch.id)
  const last = await env.DB.prepare(
    'SELECT created_at FROM messages WHERE channel_id = ? ORDER BY id DESC LIMIT 1',
  ).bind(ch.id).first<{ created_at: string }>()
  const frozen = await dmFrozen(env, participants.map((p) => p.id))
  let huddle: ChannelDTO['huddle']
  try {
    const stub = asRpc<{ getHuddle: () => Promise<NonNullable<ChannelDTO['huddle']>> }>(env.CHANNEL_DO.getByName(`channel:${ch.id}`))
    huddle = await Promise.race([
      stub.getHuddle(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 800)),
    ])
  }
  catch {
    huddle = null
  }
  return {
    id: ch.id,
    workspaceId: WORKSPACE_ID,
    name: ch.name,
    topic: ch.topic,
    type: 'dm',
    visibility: 'private',
    position: ch.position,
    huddleMeetingId: ch.huddleMeetingId,
    parentId: ch.parentId,
    parentMessageId: ch.parentMessageId,
    unread,
    huddle,
    createdAt: ch.createdAt,
    title: dmTitle(ch.name === 'dm' ? null : ch.name, participants, meId),
    participants,
    frozen,
    lastMessageAt: last?.created_at ?? null,
  }
}

export async function findPairDm(env: DiscoflareEnv, meId: string, otherId: string): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT a.channel_id as id
     FROM channel_members a
     JOIN channel_members b ON a.channel_id = b.channel_id AND b.user_id = ?
     JOIN channels c ON c.id = a.channel_id AND c.type = 'dm'
     WHERE a.user_id = ?
       AND (SELECT COUNT(*) FROM channel_members p WHERE p.channel_id = a.channel_id) = 2
     LIMIT 1`,
  ).bind(otherId, meId).first<{ id: string }>()
  return row?.id ?? null
}

export async function openPairDm(env: DiscoflareEnv, meId: string, otherId: string): Promise<string> {
  const existing = await findPairDm(env, meId, otherId)
  const db = getDb(env.DB)
  if (existing) {
    await db.update(channelMembers).set({ hiddenAt: null }).where(and(eq(channelMembers.channelId, existing), eq(channelMembers.userId, meId)))
    return existing
  }
  const id = newId()
  const created = nowIso()
  await db.insert(channels).values({
    id,
    name: 'dm',
    topic: '',
    type: 'dm',
    visibility: 'private',
    position: 0,
    huddleMeetingId: null,
    parentId: null,
    parentMessageId: null,
    createdAt: created,
    updatedAt: created,
  })
  await db.insert(channelMembers).values([
    { channelId: id, userId: meId, hiddenAt: null, joinedAt: created },
    { channelId: id, userId: otherId, hiddenAt: null, joinedAt: created },
  ])
  return id
}

export async function unhideAll(env: DiscoflareEnv, channelId: string) {
  const db = getDb(env.DB)
  await db.update(channelMembers).set({ hiddenAt: null }).where(eq(channelMembers.channelId, channelId))
}

export async function fanoutDm(env: DiscoflareEnv, channelId: string, msg: unknown) {
  try {
    const stub = asRpc<{ fanout: (m: unknown) => Promise<void> }>(env.CHANNEL_DO.getByName(`channel:${channelId}`))
    await stub.fanout(msg)
  }
  catch { /* local without DO */ }
}

export async function requireWorkspaceUser(env: DiscoflareEnv, userId: string): Promise<boolean> {
  const db = getDb(env.DB)
  const row = (await db.select().from(users).where(and(eq(users.id, userId), eq(users.status, 'active'))).limit(1))[0]
  return Boolean(row)
}
