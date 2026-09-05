import PostalMime, { type Address } from 'postal-mime'
import { newId, nowIso, WORKSPACE_ID } from '../shared/ids'
import { MAIL_EXTERNAL_USER_ID } from '../shared/mail'
import type { DiscoflareEnv } from './env'

type MailboxRow = {
  channelId: string
  address: string
}

function addressList(values: Address[] | undefined): Array<{ name: string; address: string }> {
  return (values || []).flatMap((value) => {
    if ('group' in value && value.group) return value.group.map(item => ({ name: item.name || '', address: item.address.toLowerCase() }))
    return value.address ? [{ name: value.name || '', address: value.address.toLowerCase() }] : []
  })
}

function referenceIds(inReplyTo?: string, references?: string): string[] {
  const source = `${inReplyTo || ''} ${references || ''}`
  const bracketed = source.match(/<[^>]+>/gu)
  return [...new Set((bracketed?.length ? bracketed : source.split(/\s+/u)).map(value => value.trim()).filter(Boolean))]
}

function safeFilename(value: string | null, index: number): string {
  const normalized = (value || `attachment-${index + 1}`).replace(/[\\/\0]/gu, '-').trim()
  return normalized.slice(0, 160) || `attachment-${index + 1}`
}

function plainBody(text: string | undefined, html: string | undefined): string {
  const body = (text || html?.replace(/<style[\s\S]*?<\/style>/giu, '').replace(/<script[\s\S]*?<\/script>/giu, '').replace(/<[^>]+>/gu, ' ') || '').replace(/\r\n/gu, '\n').trim()
  if (body.length <= 200_000) return body
  return `${body.slice(0, 200_000)}\n\n[Message truncated by Discoflare]`
}

export async function receiveWorkspaceEmail(message: ForwardableEmailMessage, env: DiscoflareEnv): Promise<void> {
  const recipient = message.to.trim().toLowerCase()
  const mailbox = await env.DB.prepare(
    `SELECT mb.channel_id as channelId, lower(mb.local_part || '@' || d.domain) as address
     FROM email_mailboxes mb JOIN email_domains d ON d.id = mb.domain_id
     WHERE mb.enabled = 1 AND lower(mb.local_part || '@' || d.domain) = ?`,
  ).bind(recipient).first<MailboxRow>()
  if (!mailbox) {
    message.setReject('Unknown Discoflare mailbox')
    return
  }

  const raw = await new Response(message.raw).arrayBuffer()
  const parsed = await PostalMime.parse(raw)
  if (parsed.messageId) {
    const duplicate = await env.DB.prepare('SELECT message_id FROM email_messages WHERE rfc_message_id = ?').bind(parsed.messageId).first()
    if (duplicate) return
  }

  const from = addressList(parsed.from ? [parsed.from] : [])[0] || { name: '', address: message.from.toLowerCase() }
  const to = addressList(parsed.to)
  if (!to.some(item => item.address === recipient)) to.push({ name: '', address: recipient })
  const cc = addressList(parsed.cc)
  const bcc = addressList(parsed.bcc)
  const refs = referenceIds(parsed.inReplyTo, parsed.references)
  let threadChannelId: string | null = null
  if (refs.length) {
    const placeholders = refs.map(() => '?').join(',')
    const match = await env.DB.prepare(
      `SELECT thread_channel_id as threadChannelId FROM email_messages
       WHERE rfc_message_id IN (${placeholders}) ORDER BY created_at DESC LIMIT 1`,
    ).bind(...refs).first<{ threadChannelId: string }>()
    threadChannelId = match?.threadChannelId || null
  }

  const created = nowIso()
  const messageId = newId()
  const subject = (parsed.subject || '(no subject)').replace(/[\r\n]+/gu, ' ').trim().slice(0, 500)
  const content = plainBody(parsed.text, parsed.html)
  const rawKey = `${WORKSPACE_ID}/mail/raw/${messageId}.eml`
  await env.FILES.put(rawKey, raw, { httpMetadata: { contentType: 'message/rfc822' } })

  const attachmentRows = parsed.attachments
    .filter(attachment => {
      const size = typeof attachment.content === 'string' ? new TextEncoder().encode(attachment.content).byteLength : attachment.content.byteLength
      return size > 0
    })
    .map((attachment, index) => {
      const id = newId()
      const filename = safeFilename(attachment.filename, index)
      const contentBytes = typeof attachment.content === 'string' ? new TextEncoder().encode(attachment.content) : attachment.content
      return {
        id,
        filename,
        contentType: attachment.mimeType || 'application/octet-stream',
        content: contentBytes,
        size: contentBytes.byteLength,
        key: `${WORKSPACE_ID}/mail/attachments/${messageId}/${id}-${filename}`,
      }
    })

  for (const attachment of attachmentRows) {
    await env.FILES.put(attachment.key, attachment.content, { httpMetadata: { contentType: attachment.contentType } })
  }

  const participants = [...new Set([from.address, ...to.map(item => item.address), ...cc.map(item => item.address)].filter(address => address !== mailbox.address))]
  const statements: D1PreparedStatement[] = []
  let messageChannelId = threadChannelId
  if (!threadChannelId) {
    threadChannelId = newId()
    messageChannelId = mailbox.channelId
    statements.push(
      env.DB.prepare(
        `INSERT INTO messages (id, channel_id, author_id, content, reply_to_id, edited_at, deleted_at, created_at)
         VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?)`,
      ).bind(messageId, mailbox.channelId, MAIL_EXTERNAL_USER_ID, content, created),
      env.DB.prepare(
        `INSERT INTO channels (id, name, topic, type, visibility, category_id, position, huddle_meeting_id, parent_id, parent_message_id, created_at, updated_at)
         VALUES (?, ?, '', 'thread', 'private', NULL, 0, NULL, ?, ?, ?, ?)`,
      ).bind(threadChannelId, subject.slice(0, 80), mailbox.channelId, messageId, created, created),
      env.DB.prepare(
        `INSERT INTO email_threads (channel_id, mailbox_channel_id, subject, status, participants_json, last_message_at, created_at, updated_at)
         VALUES (?, ?, ?, 'inbox', ?, ?, ?, ?)`,
      ).bind(threadChannelId, mailbox.channelId, subject, JSON.stringify(participants), created, created, created),
    )
  }
  else {
    statements.push(
      env.DB.prepare(
        `INSERT INTO messages (id, channel_id, author_id, content, reply_to_id, edited_at, deleted_at, created_at)
         VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?)`,
      ).bind(messageId, threadChannelId, MAIL_EXTERNAL_USER_ID, content, created),
      env.DB.prepare(
        `UPDATE email_threads SET status = 'inbox', participants_json = ?, last_message_at = ?, updated_at = ? WHERE channel_id = ?`,
      ).bind(JSON.stringify(participants), created, created, threadChannelId),
    )
  }
  statements.push(
    env.DB.prepare(
      `INSERT INTO email_messages
       (message_id, thread_channel_id, direction, from_address, from_name, to_json, cc_json, bcc_json,
        rfc_message_id, in_reply_to, references_json, delivery_status, raw_r2_key, created_at)
       VALUES (?, ?, 'inbound', ?, ?, ?, ?, ?, ?, ?, ?, 'received', ?, ?)`,
    ).bind(
      messageId,
      threadChannelId,
      from.address,
      from.name || null,
      JSON.stringify(to.map(item => item.address)),
      JSON.stringify(cc.map(item => item.address)),
      JSON.stringify(bcc.map(item => item.address)),
      parsed.messageId || null,
      parsed.inReplyTo || null,
      JSON.stringify(refs),
      rawKey,
      created,
    ),
    ...attachmentRows.map(attachment => env.DB.prepare(
      `INSERT INTO attachments
       (id, message_id, channel_id, uploader_id, r2_key, filename, content_type, size_bytes, width, height, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
    ).bind(attachment.id, messageId, messageChannelId, MAIL_EXTERNAL_USER_ID, attachment.key, attachment.filename, attachment.contentType, attachment.size, created)),
  )
  await env.DB.batch(statements)
}
