import { channelPath } from '../shared/paths'
import type { HuddleState, PublicUser } from '../shared/types'
import type { WorkspaceHuddleChangedEvent } from '../shared/workspace-realtime'
import { WORKSPACE_ID } from '../shared/ids'
import { asRpc, type DiscoflareEnv } from './env'

type HuddleChannel = {
  id: string
  name: string
  type: string
  visibility: string
}

async function audience(env: DiscoflareEnv, channelId: string, excludeId?: string) {
  const channel = await env.DB.prepare(
    'SELECT id, name, type, visibility FROM channels WHERE id = ?',
  ).bind(channelId).first<HuddleChannel>()
  if (!channel) return null
  const restricted = channel.type === 'dm' || channel.visibility === 'private'
  const rows = restricted
    ? await env.DB.prepare(
        `SELECT u.id
         FROM channel_members cm
         JOIN users u ON u.id = cm.user_id
         WHERE cm.channel_id = ? AND u.status = 'active'
         ORDER BY u.id`,
      ).bind(channel.id).all<{ id: string }>()
    : await env.DB.prepare(
        `SELECT id FROM users WHERE status = 'active' ORDER BY id`,
      ).all<{ id: string }>()
  const allIds = (rows.results ?? []).map(row => row.id)
  return {
    channel,
    pairDm: channel.type === 'dm' && allIds.length === 2,
    recipientIds: excludeId ? allIds.filter(id => id !== excludeId) : allIds,
  }
}

export async function signalHuddleChanged(
  env: DiscoflareEnv,
  channelId: string,
  huddle: HuddleState,
  actor?: PublicUser,
): Promise<void> {
  const target = await audience(env, channelId, actor?.id)
  if (!target?.recipientIds.length) return
  const active = huddle.active
  const event: WorkspaceHuddleChangedEvent = {
    t: 'huddle.changed',
    channelId,
    huddle,
    ring: active && target.pairDm,
    notification: {
      title: active
        ? target.pairDm
          ? `${actor?.displayName || 'Someone'} is calling`
          : `${actor?.displayName || 'Someone'} started a huddle`
        : 'Huddle ended',
      body: active ? (huddle.title || target.channel.name) : target.channel.name,
      url: channelPath(channelId),
    },
  }
  const stub = asRpc<{
    notifyHuddleChanged: (event: WorkspaceHuddleChangedEvent, recipientIds: string[]) => Promise<void>
  }>(env.WORKSPACE_DO.getByName(`workspace:${WORKSPACE_ID}`))
  await stub.notifyHuddleChanged(event, target.recipientIds)
}
