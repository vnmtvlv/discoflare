import { z } from 'zod'
import { newId, nowIso } from '../../../../../shared/ids'
import { requireMailboxPermission } from '../../../../utils/workspace-mail'
import { cf, fail } from '../../../../utils/cf'
import { parseBody } from '../../../../utils/validate'

const schema = z.object({
  to: z.array(z.string().trim().email().max(254)).min(1).max(50),
  subject: z.string().trim().min(1).max(500),
  content: z.string().trim().min(1).max(100_000),
})

export default defineEventHandler(async (event) => {
  const mailboxId = getRouterParam(event, 'id')!
  const access = await requireMailboxPermission(event, mailboxId, 'send')
  if (access.channel.type !== 'text') fail(404, 'not_found', 'Mailbox not found')
  const body = parseBody(schema, await readBody(event))
  const { env } = cf(event)
  if (!env.MAIL_EMAIL) fail(503, 'mail_unavailable', 'Workspace email sending is not bound')
  const mailbox = await env.DB.prepare(
    `SELECT lower(mb.local_part || '@' || d.domain) as address, mb.display_name as displayName
     FROM email_mailboxes mb JOIN email_domains d ON d.id = mb.domain_id WHERE mb.channel_id = ?`,
  ).bind(mailboxId).first<{ address: string; displayName: string }>()
  if (!mailbox) fail(404, 'not_found', 'Mailbox not found')
  const recipients = [...new Set(body.to.map(value => value.toLowerCase()).filter(value => value !== mailbox.address))]
  if (!recipients.length) fail(400, 'bad_request', 'Enter at least one external recipient')
  const created = nowIso()
  const messageId = newId()
  const threadId = newId()
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO messages (id, channel_id, author_id, content, reply_to_id, edited_at, deleted_at, created_at)
       VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?)`,
    ).bind(messageId, mailboxId, access.user.id, body.content, created),
    env.DB.prepare(
      `INSERT INTO channels (id, name, topic, type, visibility, category_id, position, huddle_meeting_id, parent_id, parent_message_id, created_at, updated_at)
       VALUES (?, ?, '', 'thread', 'private', NULL, 0, NULL, ?, ?, ?, ?)`,
    ).bind(threadId, body.subject.slice(0, 80), mailboxId, messageId, created, created),
    env.DB.prepare(
      `INSERT INTO email_threads (channel_id, mailbox_channel_id, subject, status, participants_json, last_message_at, created_at, updated_at)
       VALUES (?, ?, ?, 'inbox', ?, ?, ?, ?)`,
    ).bind(threadId, mailboxId, body.subject, JSON.stringify(recipients), created, created, created),
    env.DB.prepare(
      `INSERT INTO email_messages
       (message_id, thread_channel_id, direction, from_address, from_name, to_json, cc_json, bcc_json,
        rfc_message_id, in_reply_to, references_json, delivery_status, raw_r2_key, created_at)
       VALUES (?, ?, 'outbound', ?, ?, ?, '[]', '[]', NULL, NULL, '[]', 'pending', NULL, ?)`,
    ).bind(messageId, threadId, mailbox.address, mailbox.displayName, JSON.stringify(recipients), created),
  ])
  try {
    const result = await env.MAIL_EMAIL.send({
      from: { email: mailbox.address, name: mailbox.displayName },
      to: recipients,
      subject: body.subject,
      text: body.content,
    })
    await env.DB.prepare("UPDATE email_messages SET delivery_status = 'sent', rfc_message_id = ? WHERE message_id = ?")
      .bind(result.messageId || null, messageId).run()
  }
  catch (error) {
    await env.DB.prepare("UPDATE email_messages SET delivery_status = 'failed' WHERE message_id = ?").bind(messageId).run()
    throw error
  }
  return { threadId, messageId }
})
