import { asc, eq, or } from 'drizzle-orm'
import { channels, messages } from '../../../../drizzle/schema'
import type { MailMessageDTO, MailThreadDTO } from '../../../../shared/types'
import { requireMailboxPermission } from '../../../utils/workspace-mail'
import { cf, fail } from '../../../utils/cf'
import { getDb } from '../../../utils/db'
import { hydrateMailMessages } from '../../../utils/mail-data'

export default defineEventHandler(async (event): Promise<{ thread: MailThreadDTO; messages: MailMessageDTO[] }> => {
  const id = getRouterParam(event, 'id')!
  const access = await requireMailboxPermission(event, id, 'read')
  if (access.channel.type !== 'thread') fail(404, 'not_found', 'Email conversation not found')
  const { env } = cf(event)
  const db = getDb(env.DB)
  const row = await env.DB.prepare(
    `SELECT t.channel_id as channelId, t.mailbox_channel_id as mailboxChannelId, t.subject, t.status,
       t.participants_json as participantsJson, t.last_message_at as lastMessageAt
     FROM email_threads t WHERE t.channel_id = ?`,
  ).bind(id).first<{ channelId: string; mailboxChannelId: string; subject: string; status: MailThreadDTO['status']; participantsJson: string; lastMessageAt: string }>()
  if (!row) fail(404, 'not_found', 'Email conversation not found')
  const parent = (await db.select({ parentMessageId: channels.parentMessageId }).from(channels).where(eq(channels.id, id)).limit(1))[0]
  const messageRows = await db.select().from(messages).where(or(
    eq(messages.channelId, id),
    parent?.parentMessageId ? eq(messages.id, parent.parentMessageId) : eq(messages.id, ''),
  )).orderBy(asc(messages.createdAt), asc(messages.id))
  const hydrated = await hydrateMailMessages(env, messageRows, access.user.id)
  const latestId = hydrated.at(-1)?.id
  if (latestId) {
    await env.DB.prepare(
      `INSERT INTO channel_reads (channel_id, user_id, last_read_message_id, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(channel_id, user_id) DO UPDATE SET last_read_message_id = excluded.last_read_message_id, updated_at = excluded.updated_at`,
    ).bind(id, access.user.id, latestId, new Date().toISOString()).run()
  }
  return {
    thread: {
      channelId: row.channelId,
      mailboxChannelId: row.mailboxChannelId,
      subject: row.subject,
      status: row.status,
      participants: JSON.parse(row.participantsJson) as string[],
      preview: hydrated.at(-1)?.content.slice(0, 240) || '',
      lastMessageAt: row.lastMessageAt,
      unread: false,
    },
    messages: hydrated,
  }
})
