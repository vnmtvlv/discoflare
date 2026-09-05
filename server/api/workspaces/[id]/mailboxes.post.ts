import { z } from 'zod'
import { channels, emailMailboxes } from '../../../../drizzle/schema'
import { normalizeMailLocalPart } from '../../../../shared/mail'
import { newId, nowIso } from '../../../../shared/ids'
import { Permission } from '../../../../shared/permissions'
import type { MailboxPermission } from '../../../../shared/types'
import { requireMember } from '../../../utils/guards'
import { cf, fail } from '../../../utils/cf'
import { getDb } from '../../../utils/db'
import { replaceMailboxAccess } from '../../../utils/workspace-mail'
import { parseBody } from '../../../utils/validate'
import { writeAudit } from '../../../utils/messages'

const schema = z.object({
  localPart: z.string().min(1).max(64),
  displayName: z.string().trim().min(1).max(80),
  access: z.array(z.object({ userId: z.string().min(1), permission: z.enum(['read', 'send', 'manage']) })).max(200).default([]),
})

export default defineEventHandler(async (event) => {
  const workspaceId = getRouterParam(event, 'id')!
  const actor = await requireMember(event, workspaceId, Permission.manageWorkspace)
  const body = parseBody(schema, await readBody(event))
  let localPart: string
  try { localPart = normalizeMailLocalPart(body.localPart) }
  catch (error) { fail(400, 'bad_request', error instanceof Error ? error.message : 'Invalid mailbox') }
  const { env } = cf(event)
  const domain = await env.DB.prepare('SELECT domain FROM email_domains WHERE id = ?').bind('main').first<{ domain: string }>()
  if (!domain) fail(409, 'mail_unconfigured', 'Install Discoflare with a Cloudflare mail domain first')
  const existing = await env.DB.prepare('SELECT channel_id FROM email_mailboxes WHERE domain_id = ? AND local_part = ?').bind('main', localPart!).first()
  if (existing) fail(409, 'conflict', 'That mailbox already exists')
  const channelId = newId()
  const created = nowIso()
  const db = getDb(env.DB)
  await db.batch([
    db.insert(channels).values({
      id: channelId,
      name: `${localPart!}@${domain.domain}`,
      topic: '',
      type: 'text',
      visibility: 'private',
      categoryId: null,
      position: 0,
      huddleMeetingId: null,
      parentId: null,
      parentMessageId: null,
      createdAt: created,
      updatedAt: created,
    }),
    db.insert(emailMailboxes).values({ channelId, domainId: 'main', localPart: localPart!, displayName: body.displayName, enabled: true, createdAt: created, updatedAt: created }),
  ])
  const grants = new Map<string, MailboxPermission>(body.access.map(row => [row.userId, row.permission]))
  grants.set(actor.ownerId, 'manage')
  grants.set(actor.user.id, actor.isOwner ? 'manage' : (grants.get(actor.user.id) || 'manage'))
  await replaceMailboxAccess(env, channelId, [...grants].map(([userId, permission]) => ({ userId, permission })))
  await writeAudit(env, {
    workspaceId,
    actorId: actor.user.id,
    action: 'mailbox.create',
    targetType: 'mailbox',
    targetId: channelId,
    meta: { address: `${localPart!}@${domain.domain}` },
  })
  return { channelId }
})
