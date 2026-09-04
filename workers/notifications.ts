import type { PublicUser } from '../shared/types'
import { channelPath } from '../shared/paths'
import { notificationPreview, type NotificationKind, type PushNotificationPayload } from '../shared/notifications'
import type { DiscoflareEnv } from './env'
import { asRpc } from './env'

type ChannelRow = {
  id: string
  name: string
  type: string
  visibility: string
  parent_id: string | null
}

type NotificationSpec = {
  eventId: string
  kind: NotificationKind
  channelId: string
  recipientIds: string[]
  payload: PushNotificationPayload
}

type NotificationMessage = {
  id: string
  channelId: string
  author: PublicUser
  content: string
  mentions: string[]
  attachmentCount: number
}

async function channelAndRoot(env: DiscoflareEnv, channelId: string): Promise<{ channel: ChannelRow; root: ChannelRow } | null> {
  const channel = await env.DB.prepare(
    'SELECT id, name, type, visibility, parent_id FROM channels WHERE id = ?',
  ).bind(channelId).first<ChannelRow>()
  if (!channel) return null
  if (channel.type !== 'thread' || !channel.parent_id) return { channel, root: channel }
  const root = await env.DB.prepare(
    'SELECT id, name, type, visibility, parent_id FROM channels WHERE id = ?',
  ).bind(channel.parent_id).first<ChannelRow>()
  return root ? { channel, root } : null
}

async function activeDmRecipients(env: DiscoflareEnv, channelId: string, actorId: string): Promise<string[]> {
  const rows = await env.DB.prepare(
    `SELECT cm.user_id
     FROM channel_members cm
     JOIN users u ON u.id = cm.user_id AND u.status = 'active'
     WHERE cm.channel_id = ? AND cm.user_id <> ?`,
  ).bind(channelId, actorId).all<{ user_id: string }>()
  return (rows.results ?? []).map(row => row.user_id)
}

async function accessibleMentions(env: DiscoflareEnv, root: ChannelRow, actorId: string, mentions: string[]): Promise<string[]> {
  const candidates = [...new Set(mentions)].filter(id => id !== actorId)
  if (!candidates.length) return []
  const placeholders = candidates.map(() => '?').join(',')
  if (root.visibility === 'private') {
    const rows = await env.DB.prepare(
      `SELECT u.id
       FROM users u
       JOIN channel_members cm ON cm.user_id = u.id AND cm.channel_id = ?
       WHERE u.id IN (${placeholders}) AND u.status = 'active'`,
    ).bind(root.id, ...candidates).all<{ id: string }>()
    return (rows.results ?? []).map(row => row.id)
  }
  const rows = await env.DB.prepare(
    `SELECT id FROM users WHERE id IN (${placeholders}) AND status = 'active'`,
  ).bind(...candidates).all<{ id: string }>()
  return (rows.results ?? []).map(row => row.id)
}

async function huddleRecipients(env: DiscoflareEnv, channel: ChannelRow, actorId: string): Promise<string[]> {
  if (channel.type === 'dm' || channel.visibility === 'private') {
    return activeDmRecipients(env, channel.id, actorId)
  }
  const rows = await env.DB.prepare(
    `SELECT id FROM users WHERE status = 'active' AND id <> ?`,
  ).bind(actorId).all<{ id: string }>()
  return (rows.results ?? []).map(row => row.id)
}

function outboxStatement(env: DiscoflareEnv, spec: NotificationSpec): D1PreparedStatement | null {
  const recipientIds = [...new Set(spec.recipientIds)]
  if (!recipientIds.length) return null
  const placeholders = recipientIds.map(() => '?').join(',')
  const now = new Date().toISOString()
  return env.DB.prepare(
    `INSERT OR IGNORE INTO notification_outbox (
       event_id, subscription_id, recipient_id, kind, channel_id, payload_json,
       attempts, available_at, lease_token, lease_until, delivered_at, failed_at, last_error, created_at
     )
     SELECT ?, ps.id, ps.user_id, ?, ?, ?, 0, ?, NULL, NULL, NULL, NULL, NULL, ?
     FROM push_subscriptions ps
     WHERE ps.user_id IN (${placeholders})`,
  ).bind(
    spec.eventId,
    spec.kind,
    spec.channelId,
    JSON.stringify(spec.payload),
    now,
    now,
    ...recipientIds,
  )
}

export async function messageNotificationStatement(env: DiscoflareEnv, message: NotificationMessage): Promise<D1PreparedStatement | null> {
  const channels = await channelAndRoot(env, message.channelId)
  if (!channels) return null
  const { channel, root } = channels
  const dm = root.type === 'dm'
  const recipientIds = dm
    ? await activeDmRecipients(env, root.id, message.author.id)
    : await accessibleMentions(env, root, message.author.id, message.mentions)
  if (!recipientIds.length) return null
  const kind: NotificationKind = dm ? 'dm_message' : 'mention'
  const title = dm ? message.author.displayName : `${message.author.displayName} mentioned you in #${root.name}`
  const url = channel.type === 'thread' ? channelPath(root.id, channel.id) : channelPath(channel.id)
  return outboxStatement(env, {
    eventId: `message:${message.id}`,
    kind,
    channelId: message.channelId,
    recipientIds,
    payload: {
      title,
      body: notificationPreview(message.content, message.attachmentCount),
      tag: `message:${message.id}`,
      url,
      icon: '/android-chrome-192x192.png',
      badge: '/favicon-32x32.png',
    },
  })
}

export async function huddleNotificationStatement(
  env: DiscoflareEnv,
  channelId: string,
  meetingId: string,
  actor: PublicUser,
): Promise<D1PreparedStatement | null> {
  const channels = await channelAndRoot(env, channelId)
  if (!channels || channels.channel.type === 'thread') return null
  const recipientIds = await huddleRecipients(env, channels.channel, actor.id)
  return outboxStatement(env, {
    eventId: `huddle:${meetingId}`,
    kind: 'huddle_started',
    channelId,
    recipientIds,
    payload: {
      title: `${actor.displayName} started a huddle in ${channels.channel.name}`,
      body: 'Tap to join',
      tag: `huddle:${meetingId}`,
      url: channelPath(channelId),
      icon: '/android-chrome-192x192.png',
      badge: '/favicon-32x32.png',
    },
  })
}

export async function signalNotificationOutbox(env: DiscoflareEnv): Promise<void> {
  try {
    const stub = asRpc<{ kick: () => Promise<void> }>(env.NOTIFICATION_DO.getByName('notifications:main'))
    await stub.kick()
  }
  catch { /* message delivery must not fail when the optional push path is unavailable */ }
}
