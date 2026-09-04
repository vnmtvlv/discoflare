import { WORKSPACE_ID } from '../shared/ids'
import type { WorkspaceChannelActivityEvent, WorkspaceChannelReadEvent } from '../shared/workspace-realtime'
import { asRpc, type DiscoflareEnv } from './env'
import { channelHasUnread } from './unread'

type ChannelRoot = {
  id: string
  type: string
  visibility: string
}

export type ChannelActivityAudience = {
  sourceChannelId: string
  rootChannelId: string
  rootType: string
  recipientIds: string[]
}

export async function resolveChannelRoot(db: D1Database, channelId: string): Promise<ChannelRoot | null> {
  const source = await db.prepare(
    'SELECT id, type, visibility, parent_id FROM channels WHERE id = ?',
  ).bind(channelId).first<ChannelRoot & { parent_id: string | null }>()
  if (!source) return null
  if (source.type !== 'thread') return source
  if (!source.parent_id) return null
  return db.prepare(
    'SELECT id, type, visibility FROM channels WHERE id = ?',
  ).bind(source.parent_id).first<ChannelRoot>()
}

export async function channelActivityAudience(
  db: D1Database,
  channelId: string,
  authorId: string,
): Promise<ChannelActivityAudience | null> {
  const root = await resolveChannelRoot(db, channelId)
  if (!root) return null
  const restricted = root.visibility === 'private' || root.type === 'dm'
  const rows = restricted
    ? await db.prepare(
        `SELECT u.id
         FROM channel_members cm
         JOIN users u ON u.id = cm.user_id
         WHERE cm.channel_id = ? AND u.status = 'active' AND u.id <> ?
         ORDER BY u.id`,
      ).bind(root.id, authorId).all<{ id: string }>()
    : await db.prepare(
        `SELECT id
         FROM users
         WHERE status = 'active' AND id <> ?
         ORDER BY id`,
      ).bind(authorId).all<{ id: string }>()
  return {
    sourceChannelId: channelId,
    rootChannelId: root.id,
    rootType: root.type,
    recipientIds: (rows.results ?? []).map(row => row.id),
  }
}

export async function signalChannelActivity(
  env: DiscoflareEnv,
  channelId: string,
  authorId: string,
  messageId: string,
): Promise<void> {
  const audience = await channelActivityAudience(env.DB, channelId, authorId)
  if (!audience) return
  if (audience.rootType === 'dm') {
    await env.DB.prepare('UPDATE channel_members SET hidden_at = NULL WHERE channel_id = ?').bind(audience.rootChannelId).run()
  }
  if (!audience.recipientIds.length) return
  const event: WorkspaceChannelActivityEvent = {
    t: 'channel.activity',
    sourceChannelId: audience.sourceChannelId,
    rootChannelId: audience.rootChannelId,
    messageId,
  }
  const stub = asRpc<{
    notifyChannelActivity: (event: WorkspaceChannelActivityEvent, recipientIds: string[]) => Promise<void>
  }>(env.WORKSPACE_DO.getByName(`workspace:${WORKSPACE_ID}`))
  await stub.notifyChannelActivity(event, audience.recipientIds)
}

export async function signalChannelRead(
  env: DiscoflareEnv,
  userId: string,
  channelId: string,
  messageId: string,
): Promise<void> {
  const root = await resolveChannelRoot(env.DB, channelId)
  if (!root) return
  const event: WorkspaceChannelReadEvent = {
    t: 'channel.read',
    sourceChannelId: channelId,
    rootChannelId: root.id,
    messageId,
    unread: await channelHasUnread(env.DB, userId, root.id),
  }
  const stub = asRpc<{
    notifyChannelRead: (event: WorkspaceChannelReadEvent, userId: string) => Promise<void>
  }>(env.WORKSPACE_DO.getByName(`workspace:${WORKSPACE_ID}`))
  await stub.notifyChannelRead(event, userId)
}
