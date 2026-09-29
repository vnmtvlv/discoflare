import type { MailThreadPageDTO, MailThreadStatus } from '../../../../../shared/types'
import { requireMailboxPermission } from '../../../../utils/workspace-mail'
import { cf } from '../../../../utils/cf'
import { mailThreadDto } from '../../../../utils/mail-data'

const statuses = new Set<MailThreadStatus>(['inbox', 'archive', 'spam', 'trash'])
const PAGE_SIZE = 50

/** Cursor for the next page: the last conversation's time and id, newest first. */
function parseCursor(value: unknown): { at: string; id: string } | null {
  if (typeof value !== 'string') return null
  const separator = value.lastIndexOf('|')
  if (separator <= 0) return null
  return { at: value.slice(0, separator), id: value.slice(separator + 1) }
}

export default defineEventHandler(async (event): Promise<MailThreadPageDTO> => {
  const channelId = getRouterParam(event, 'id')!
  const access = await requireMailboxPermission(event, channelId, 'read')
  const query = getQuery(event)
  const requested = String(query.status || 'inbox') as MailThreadStatus
  const status = statuses.has(requested) ? requested : 'inbox'
  const cursor = parseCursor(query.before)
  const { env } = cf(event)
  // The preview is the conversation's latest reply, or the message that started
  // it, which lives in the mailbox. Two lookups keep both on their indexes.
  const rows = await env.DB.prepare(
    `SELECT t.channel_id as channelId, t.mailbox_channel_id as mailboxChannelId, t.subject, t.status,
       t.participants_json as participantsJson, t.last_message_at as lastMessageAt,
       coalesce(
         (SELECT substr(m.content, 1, 240) FROM messages m WHERE m.channel_id = t.channel_id ORDER BY m.created_at DESC, m.id DESC LIMIT 1),
         (SELECT substr(m.content, 1, 240) FROM channels c JOIN messages m ON m.id = c.parent_message_id WHERE c.id = t.channel_id),
         ''
       ) as preview,
       CASE WHEN r.last_read_message_id IS NULL OR r.last_read_message_id <
         (SELECT max(em.message_id) FROM email_messages em WHERE em.thread_channel_id = t.channel_id AND em.direction = 'inbound')
         THEN 1 ELSE 0 END as unread
     FROM email_threads t
     LEFT JOIN channel_reads r ON r.channel_id = t.channel_id AND r.user_id = ?
     WHERE t.mailbox_channel_id = ? AND t.status = ?
       AND (? IS NULL OR t.last_message_at < ? OR (t.last_message_at = ? AND t.channel_id < ?))
     ORDER BY t.last_message_at DESC, t.channel_id DESC LIMIT ?`,
  ).bind(
    access.user.id, access.mailboxId, status,
    cursor?.at ?? null, cursor?.at ?? null, cursor?.at ?? null, cursor?.id ?? null,
    PAGE_SIZE + 1,
  ).all<Parameters<typeof mailThreadDto>[0]>()
  const results = rows.results || []
  const page = results.slice(0, PAGE_SIZE)
  const last = page.at(-1)
  return {
    threads: page.map(mailThreadDto),
    nextCursor: results.length > PAGE_SIZE && last ? `${last.lastMessageAt}|${last.channelId}` : null,
  }
})
