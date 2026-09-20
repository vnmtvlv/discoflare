import { inArray } from 'drizzle-orm'
import { emailMessages } from '../../drizzle/schema'
import type { messages } from '../../drizzle/schema'
import type { DiscoflareEnv } from '../../workers/env'
import type { MailMessageDTO } from '../../shared/types'
import { getDb } from './db'
import { hydrateMessages } from './messages'

function stringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : []
  }
  catch {
    return []
  }
}

export async function hydrateMailMessages(env: DiscoflareEnv, rows: Array<typeof messages.$inferSelect>, viewerId: string): Promise<MailMessageDTO[]> {
  const base = await hydrateMessages(env, rows, viewerId)
  if (!rows.length) return []
  const db = getDb(env.DB)
  const extensions = await db.select().from(emailMessages).where(inArray(emailMessages.messageId, rows.map(row => row.id)))
  const byId = new Map(extensions.map(row => [row.messageId, row]))
  return base.map((message) => {
    const email = byId.get(message.id)
    return {
      ...message,
      author: email?.direction === 'inbound'
        ? { ...message.author, displayName: email.fromName || email.fromAddress }
        : message.author,
      email: email
        ? {
            direction: email.direction,
            fromAddress: email.fromAddress,
            fromName: email.fromName,
            to: stringArray(email.toJson),
            cc: stringArray(email.ccJson),
            bcc: stringArray(email.bccJson),
            deliveryStatus: email.deliveryStatus,
          }
        : null,
    }
  })
}
