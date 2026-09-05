import { z } from 'zod'
import { newId, nowIso } from '../../../../../shared/ids'
import { requireMailboxPermission } from '../../../../utils/workspace-mail'
import { cf, fail } from '../../../../utils/cf'
import { parseBody } from '../../../../utils/validate'

const schema = z.object({ content: z.string().trim().min(1).max(100_000) })

function stringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : []
  }
  catch { return [] }
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const access = await requireMailboxPermission(event, id, 'send')
  if (access.channel.type !== 'thread') fail(404, 'not_found', 'Email conversation not found')
  const body = parseBody(schema, await readBody(event))
  const { env } = cf(event)
  if (!env.MAIL_EMAIL) fail(503, 'mail_unavailable', 'Workspace email sending is not bound')
  const thread = await env.DB.prepare(
    `SELECT t.subject, t.participants_json as participantsJson,
       lower(mb.local_part || '@' || d.domain) as mailboxAddress, mb.display_name as displayName
     FROM email_threads t JOIN email_mailboxes mb ON mb.channel_id = t.mailbox_channel_id
     JOIN email_domains d ON d.id = mb.domain_id WHERE t.channel_id = ?`,
  ).bind(id).first<{ subject: string; participantsJson: string; mailboxAddress: string; displayName: string }>()
  if (!thread) fail(404, 'not_found', 'Email conversation not found')
  const recipients = [...new Set(stringArray(thread.participantsJson).filter(value => value.toLowerCase() !== thread.mailboxAddress))]
  if (!recipients.length) fail(409, 'no_recipient', 'This conversation has no external recipient')
  const previous = await env.DB.prepare(
    `SELECT rfc_message_id as rfcMessageId, references_json as referencesJson FROM email_messages
     WHERE thread_channel_id = ? ORDER BY created_at DESC LIMIT 1`,
  ).bind(id).first<{ rfcMessageId: string | null; referencesJson: string }>()
  const references = [...new Set([...stringArray(previous?.referencesJson || '[]'), ...(previous?.rfcMessageId ? [previous.rfcMessageId] : [])])]
  const created = nowIso()
  const messageId = newId()
  const subject = /^re:/iu.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO messages (id, channel_id, author_id, content, reply_to_id, edited_at, deleted_at, created_at)
       VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?)`,
    ).bind(messageId, id, access.user.id, body.content, created),
    env.DB.prepare(
      `INSERT INTO email_messages
       (message_id, thread_channel_id, direction, from_address, from_name, to_json, cc_json, bcc_json,
        rfc_message_id, in_reply_to, references_json, delivery_status, raw_r2_key, created_at)
       VALUES (?, ?, 'outbound', ?, ?, ?, '[]', '[]', NULL, ?, ?, 'pending', NULL, ?)`,
    ).bind(messageId, id, thread.mailboxAddress, thread.displayName, JSON.stringify(recipients), previous?.rfcMessageId || null, JSON.stringify(references), created),
    env.DB.prepare('UPDATE email_threads SET last_message_at = ?, updated_at = ? WHERE channel_id = ?').bind(created, created, id),
  ])
  try {
    const result = await env.MAIL_EMAIL.send({
      from: { email: thread.mailboxAddress, name: thread.displayName },
      to: recipients,
      subject,
      text: body.content,
      headers: {
        ...(previous?.rfcMessageId ? { 'In-Reply-To': previous.rfcMessageId } : {}),
        ...(references.length ? { References: references.join(' ') } : {}),
      },
    })
    await env.DB.prepare("UPDATE email_messages SET delivery_status = 'sent', rfc_message_id = ? WHERE message_id = ?")
      .bind(result.messageId || null, messageId).run()
  }
  catch (error) {
    await env.DB.prepare("UPDATE email_messages SET delivery_status = 'failed' WHERE message_id = ?").bind(messageId).run()
    throw error
  }
  return { id: messageId }
})
