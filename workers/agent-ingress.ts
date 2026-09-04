import { isDmType } from '../shared/dm'
import { asRpc, type DiscoflareEnv } from './env'

type AgentIngressMessage = {
  messageId: string
  channelId: string
  authorName: string
  content: string
  mentionIds: string[]
}

/** Starts one durable reply workflow per addressed agent. D1 remains the routing authority. */
export async function signalAgentsForMessage(env: DiscoflareEnv, message: AgentIngressMessage): Promise<void> {
  if (!message.content.trim()) return
  const channel = await env.DB.prepare(
    'SELECT type, visibility FROM channels WHERE id = ?',
  ).bind(message.channelId).first<{ type: string; visibility: string }>()
  if (!channel) return

  const candidates = new Set(message.mentionIds)
  if (isDmType(channel.type)) {
    const rows = await env.DB.prepare(
      `SELECT u.id
       FROM channel_members cm
       JOIN users u ON u.id = cm.user_id
       JOIN agents a ON a.user_id = u.id
       WHERE cm.channel_id = ? AND u.kind = 'agent' AND u.status = 'active' AND a.status = 'active'`,
    ).bind(message.channelId).all<{ id: string }>()
    for (const row of rows.results ?? []) candidates.add(row.id)
  }
  if (!candidates.size) return

  const ids = [...candidates]
  const placeholders = ids.map(() => '?').join(',')
  const accessClause = channel.visibility === 'private'
    ? `AND EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = ? AND cm.user_id = u.id)`
    : ''
  const rows = await env.DB.prepare(
    `SELECT u.id
     FROM users u JOIN agents a ON a.user_id = u.id
     WHERE u.id IN (${placeholders}) AND u.kind = 'agent' AND u.status = 'active' AND a.status = 'active'
     ${accessClause}`,
  ).bind(...ids, ...(channel.visibility === 'private' ? [message.channelId] : [])).all<{ id: string }>()

  await Promise.allSettled((rows.results ?? []).map(async ({ id }) => {
    const stub = asRpc<{
      receiveMessage: (input: Omit<AgentIngressMessage, 'mentionIds'>) => Promise<string>
    }>(env.AGENT_DO.getByName(`agent:${id}`))
    await stub.receiveMessage({
      messageId: message.messageId,
      channelId: message.channelId,
      authorName: message.authorName,
      content: message.content,
    })
  }))
}
