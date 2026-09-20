import type { MailThreadDTO, MailThreadStatus } from '../../../../../shared/types'
import { requireMailboxPermission } from '../../../../utils/workspace-mail'
import { cf } from '../../../../utils/cf'

const statuses = new Set<MailThreadStatus>(['inbox', 'archive', 'spam', 'trash'])

export default defineEventHandler(async (event): Promise<{ threads: MailThreadDTO[] }> => {
  const channelId = getRouterParam(event, 'id')!
  const access = await requireMailboxPermission(event, channelId, 'read')
  const requested = String(getQuery(event).status || 'inbox') as MailThreadStatus
  const status = statuses.has(requested) ? requested : 'inbox'
  const { env } = cf(event)
  const rows = await env.DB.prepare(
    `SELECT t.channel_id as channelId, t.mailbox_channel_id as mailboxChannelId, t.subject, t.status,
       t.participants_json as participantsJson, t.last_message_at as lastMessageAt,
       coalesce((SELECT m.content FROM messages m
         WHERE m.channel_id = t.channel_id OR m.id = (SELECT parent_message_id FROM channels WHERE id = t.channel_id)
         ORDER BY m.created_at DESC, m.id DESC LIMIT 1), '') as preview,
       CASE WHEN r.last_read_message_id IS NULL OR r.last_read_message_id <
         (SELECT max(em.message_id) FROM email_messages em WHERE em.thread_channel_id = t.channel_id AND em.direction = 'inbound')
         THEN 1 ELSE 0 END as unread
     FROM email_threads t
     LEFT JOIN channel_reads r ON r.channel_id = t.channel_id AND r.user_id = ?
     WHERE t.mailbox_channel_id = ? AND t.status = ?
     ORDER BY t.last_message_at DESC LIMIT 200`,
  ).bind(access.user.id, access.mailboxId, status).all<{
    channelId: string; mailboxChannelId: string; subject: string; status: MailThreadStatus
    participantsJson: string; preview: string; lastMessageAt: string; unread: number
  }>()
  return {
    threads: (rows.results || []).map(row => ({
      channelId: row.channelId,
      mailboxChannelId: row.mailboxChannelId,
      subject: row.subject,
      status: row.status,
      participants: JSON.parse(row.participantsJson) as string[],
      preview: row.preview.slice(0, 240),
      lastMessageAt: row.lastMessageAt,
      unread: Boolean(row.unread),
    })),
  }
})
