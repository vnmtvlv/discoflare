import type { H3Event } from 'h3'
import { and, eq } from 'drizzle-orm'
import { emailMailboxAccess, emailMailboxes, users } from '../../drizzle/schema'
import { newId, nowIso } from '../../shared/ids'
import type { DiscoflareEnv } from '../../workers/env'
import type { MailboxPermission } from '../../shared/types'
import { MAIL_DOMAIN_ID, MAIL_EXTERNAL_USER_ID, mailAddress, mailPermissionAllows, normalizeMailLocalPart } from '../../shared/mail'
import { requireChannelAccess } from './guards'
import { cf, fail } from './cf'
import { getDb } from './db'

export async function ensureWorkspaceMailFromEnv(env: DiscoflareEnv): Promise<void> {
  const domain = env.MAIL_DOMAIN?.trim().toLowerCase()
  const zoneId = env.MAIL_ZONE_ID?.trim()
  const appHostname = env.MAIL_APP_HOSTNAME?.trim().toLowerCase()
  if (!domain || !zoneId || !appHostname) return

  const owner = await env.DB.prepare('SELECT owner_id as ownerId FROM workspace WHERE id = ?').bind('main').first<{ ownerId: string }>()
  if (!owner) return
  const created = nowIso()
  const existing = await env.DB.prepare('SELECT channel_id as channelId, local_part as localPart FROM email_mailboxes LIMIT 1').first<{ channelId: string; localPart: string }>()
  const localPart = existing?.localPart || normalizeMailLocalPart(env.MAIL_DEFAULT_LOCAL_PART || 'inbox')
  const channelId = existing?.channelId || newId()
  const identityCreated = Date.now()

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO identity_keys (id, name, email, email_verified, image, created_at, updated_at)
       VALUES (?, 'Email', 'mail@identity.discoflare.invalid', 0, NULL, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    ).bind(MAIL_EXTERNAL_USER_ID, identityCreated, identityCreated),
    env.DB.prepare(
      `INSERT INTO users (id, kind, handle, display_name, avatar_r2_key, status, role_id, nickname, joined_at, created_at, updated_at)
       VALUES (?, 'human', NULL, 'Email', NULL, 'removed', NULL, NULL, NULL, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    ).bind(MAIL_EXTERNAL_USER_ID, created, created),
    env.DB.prepare(
      `INSERT INTO email_domains (id, zone_id, domain, app_hostname, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET zone_id = excluded.zone_id, domain = excluded.domain,
         app_hostname = excluded.app_hostname, updated_at = excluded.updated_at`,
    ).bind(MAIL_DOMAIN_ID, zoneId, domain, appHostname, created, created),
    env.DB.prepare(
      `INSERT INTO channels (id, name, topic, type, visibility, category_id, position, huddle_meeting_id, parent_id, parent_message_id, created_at, updated_at)
       VALUES (?, ?, '', 'text', 'private', NULL, 0, NULL, NULL, NULL, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`,
    ).bind(channelId, mailAddress(localPart, domain), created, created),
    env.DB.prepare(
      `INSERT INTO email_mailboxes (channel_id, domain_id, local_part, display_name, enabled, created_at, updated_at)
       VALUES (?, ?, ?, 'Inbox', 1, ?, ?)
       ON CONFLICT(channel_id) DO UPDATE SET domain_id = excluded.domain_id, updated_at = excluded.updated_at`,
    ).bind(channelId, MAIL_DOMAIN_ID, localPart, created, created),
    env.DB.prepare(
      `INSERT INTO channel_members (channel_id, user_id, hidden_at, joined_at)
       VALUES (?, ?, NULL, ?) ON CONFLICT(channel_id, user_id) DO UPDATE SET hidden_at = NULL`,
    ).bind(channelId, owner.ownerId, created),
    env.DB.prepare(
      `INSERT INTO email_mailbox_access (channel_id, user_id, permission, created_at, updated_at)
       VALUES (?, ?, 'manage', ?, ?)
       ON CONFLICT(channel_id, user_id) DO UPDATE SET permission = 'manage', updated_at = excluded.updated_at`,
    ).bind(channelId, owner.ownerId, created, created),
  ])
}

export async function requireMailboxPermission(event: H3Event, channelId: string, needed: MailboxPermission) {
  const access = await requireChannelAccess(event, channelId)
  const { env } = cf(event)
  const db = getDb(env.DB)
  const mailboxId = access.channel.type === 'thread' && access.channel.parentId ? access.channel.parentId : access.channel.id
  const mailbox = (await db.select().from(emailMailboxes).where(eq(emailMailboxes.channelId, mailboxId)).limit(1))[0]
  if (!mailbox) fail(404, 'not_found', 'Mailbox not found')
  if (!mailbox.enabled) fail(404, 'not_found', 'Mailbox not found')
  const grant = (await db.select().from(emailMailboxAccess).where(and(
    eq(emailMailboxAccess.channelId, mailboxId),
    eq(emailMailboxAccess.userId, access.user.id),
  )).limit(1))[0]
  if (!grant || !mailPermissionAllows(grant.permission, needed)) fail(403, 'forbidden', 'Missing mailbox permission')
  return { ...access, mailbox, mailboxId, mailPermission: grant.permission }
}

export async function replaceMailboxAccess(env: DiscoflareEnv, channelId: string, rows: Array<{ userId: string; permission: MailboxPermission }>) {
  const db = getDb(env.DB)
  const active = await db.select({ id: users.id }).from(users).where(eq(users.status, 'active'))
  const validIds = new Set(active.map(row => row.id))
  const unique = new Map(rows.filter(row => validIds.has(row.userId)).map(row => [row.userId, row.permission]))
  const created = nowIso()
  await env.DB.batch([
    env.DB.prepare('DELETE FROM email_mailbox_access WHERE channel_id = ?').bind(channelId),
    env.DB.prepare('DELETE FROM channel_members WHERE channel_id = ?').bind(channelId),
    ...[...unique].flatMap(([userId, permission]) => [
      env.DB.prepare('INSERT INTO channel_members (channel_id, user_id, hidden_at, joined_at) VALUES (?, ?, NULL, ?)').bind(channelId, userId, created),
      env.DB.prepare('INSERT INTO email_mailbox_access (channel_id, user_id, permission, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(channelId, userId, permission, created, created),
    ]),
  ])
}
