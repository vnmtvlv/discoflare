import { inArray } from 'drizzle-orm'
import { attachments, channels, messageMentions, messageReactions, messages, users } from '../../drizzle/schema'
import type { AttachmentDTO, MessageDTO, PublicUser, ReactionDTO } from '../../shared/types'
import type { DiscoflareEnv } from '../../workers/env'
import { getDb } from './db'

export function toPublicUser(row: typeof users.$inferSelect): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    avatarR2Key: row.avatarR2Key,
  }
}

export function attachmentDto(row: typeof attachments.$inferSelect): AttachmentDTO {
  return {
    id: row.id,
    filename: row.filename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    url: `/api/files/${row.id}`,
  }
}

export async function hydrateMessages(env: DiscoflareEnv, rows: Array<typeof messages.$inferSelect>, viewerId?: string): Promise<MessageDTO[]> {
  if (!rows.length) return []
  const db = getDb(env.DB)
  const ids = rows.map((r) => r.id)
  const authorIds = [...new Set(rows.map((r) => r.authorId))]
  const replyIds = rows.map((r) => r.replyToId).filter((x): x is string => Boolean(x))

  const authorRows = await db.select().from(users).where(inArray(users.id, authorIds))
  const authors = new Map(authorRows.map((u) => [u.id, toPublicUser(u)]))

  const mentionRows = await db.select().from(messageMentions).where(inArray(messageMentions.messageId, ids))
  const mentions = new Map<string, string[]>()
  for (const m of mentionRows) {
    const list = mentions.get(m.messageId) ?? []
    list.push(m.userId)
    mentions.set(m.messageId, list)
  }

  const attRows = await db.select().from(attachments).where(inArray(attachments.messageId, ids))
  const atts = new Map<string, AttachmentDTO[]>()
  for (const a of attRows) {
    if (!a.messageId) continue
    const list = atts.get(a.messageId) ?? []
    list.push(attachmentDto(a))
    atts.set(a.messageId, list)
  }

  const replies = new Map<string, { id: string; authorId: string; content: string }>()
  if (replyIds.length) {
    const replyRows = await db.select().from(messages).where(inArray(messages.id, replyIds))
    for (const r of replyRows) {
      replies.set(r.id, { id: r.id, authorId: r.authorId, content: (r.deletedAt ? '' : r.content).slice(0, 180) })
    }
  }

  const reactionRows = await db.select().from(messageReactions).where(inArray(messageReactions.messageId, ids))
  const reactionMap = new Map<string, ReactionDTO[]>()
  for (const r of reactionRows) {
    const list = reactionMap.get(r.messageId) ?? []
    const existing = list.find((x) => x.emoji === r.emoji)
    if (existing) {
      existing.count += 1
      if (viewerId && r.userId === viewerId) existing.me = true
    }
    else {
      list.push({ emoji: r.emoji, count: 1, me: Boolean(viewerId && r.userId === viewerId) })
    }
    reactionMap.set(r.messageId, list)
  }

  const threadRows = await db.select({ id: channels.id, parentMessageId: channels.parentMessageId }).from(channels).where(inArray(channels.parentMessageId, ids))
  const threads = new Map<string, string>()
  for (const t of threadRows) {
    if (t.parentMessageId) threads.set(t.parentMessageId, t.id)
  }

  return rows.map((row) => ({
    id: row.id,
    channelId: row.channelId,
    guildId: row.guildId,
    author: authors.get(row.authorId) ?? { id: row.authorId, email: '', displayName: 'Unknown', avatarR2Key: null },
    content: row.deletedAt ? '' : row.content,
    replyTo: row.replyToId ? replies.get(row.replyToId) ?? null : null,
    mentions: mentions.get(row.id) ?? [],
    attachments: atts.get(row.id) ?? [],
    reactions: reactionMap.get(row.id) ?? [],
    threadId: threads.get(row.id) ?? null,
    editedAt: row.editedAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
  }))
}

export async function writeAudit(
  env: DiscoflareEnv,
  input: { guildId: string; actorId: string; action: string; targetType: string; targetId: string; meta?: Record<string, unknown> },
) {
  const { newId, nowIso } = await import('../../shared/ids')
  await env.DB.prepare(
    'INSERT INTO audit_log (id, guild_id, actor_id, action, target_type, target_id, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    newId(),
    input.guildId,
    input.actorId,
    input.action,
    input.targetType,
    input.targetId,
    JSON.stringify(input.meta ?? {}),
    nowIso(),
  ).run()
}
