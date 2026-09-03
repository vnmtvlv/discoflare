import type { H3Event } from 'h3'
import { ALL_PERMISSIONS, MemberPermissions } from '../../shared/permissions'
import { newId, nowIso } from '../../shared/ids'
import { account, auditLog, channels, guildMembers, guilds, roles, user, users } from '../../drizzle/schema'
import { cf } from './cf'
import { ensureMigrated, getDb, userCount } from './db'
import { hashPassword } from './password'
import type { DiscoflareEnv } from '../../workers/env'

export type AdminSeed = {
  email: string
  password: string
  displayName: string
  guildName: string
}

export function readAdminEnv(env: Pick<DiscoflareEnv, 'ADMIN_EMAIL' | 'ADMIN_PASSWORD' | 'ADMIN_NAME' | 'ADMIN_HANDLE' | 'ADMIN_WORKSPACE'>): AdminSeed | null {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase() || ''
  const password = env.ADMIN_PASSWORD || ''
  if (!email.includes('@') || password.length < 8) return null
  const displayName = (env.ADMIN_NAME?.trim() || env.ADMIN_HANDLE?.trim() || email.split('@')[0] || 'Admin').slice(0, 80)
  const guildName = (env.ADMIN_WORKSPACE?.trim() || 'HQ').slice(0, 80)
  return { email, password, displayName, guildName }
}

export async function provisionWorkspace(event: H3Event, seed: AdminSeed) {
  const { env } = cf(event)
  const db = getDb(env.DB)
  const userId = newId()
  const accountId = newId()
  const guildId = newId()
  const ownerRoleId = newId()
  const adminRoleId = newId()
  const memberRoleId = newId()
  const generalId = newId()
  const randomId = newId()
  const voiceId = newId()
  const auditId = newId()
  const created = nowIso()
  const authCreated = new Date(created)
  const passwordHash = await hashPassword(seed.password)

  await db.batch([
    db.insert(user).values({
      id: userId,
      name: seed.displayName,
      email: seed.email,
      emailVerified: true,
      image: null,
      createdAt: authCreated,
      updatedAt: authCreated,
    }),
    db.insert(account).values({
      id: accountId,
      issuer: 'local:credential',
      accountId: userId,
      providerId: 'credential',
      userId,
      password: passwordHash,
      createdAt: authCreated,
      updatedAt: authCreated,
    }),
    db.insert(users).values({
      id: userId,
      email: seed.email,
      passwordHash,
      displayName: seed.displayName,
      avatarR2Key: null,
      createdAt: created,
    }),
    db.insert(guilds).values({
      id: guildId,
      name: seed.guildName,
      iconR2Key: null,
      ownerId: userId,
      createdAt: created,
    }),
    db.insert(roles).values([
      { id: ownerRoleId, guildId, name: 'owner', permissionsBitmask: ALL_PERMISSIONS, position: 0, createdAt: created },
      { id: adminRoleId, guildId, name: 'admin', permissionsBitmask: ALL_PERMISSIONS, position: 1, createdAt: created },
      { id: memberRoleId, guildId, name: 'member', permissionsBitmask: MemberPermissions, position: 2, createdAt: created },
    ]),
    db.insert(guildMembers).values({
      guildId,
      userId,
      roleId: ownerRoleId,
      lastSeenAt: created,
      nickname: null,
    }),
    db.insert(channels).values([
      { id: generalId, guildId, name: 'general', topic: '', type: 'text', position: 0, huddleMeetingId: null, parentId: null, parentMessageId: null, createdAt: created },
      { id: randomId, guildId, name: 'random', topic: '', type: 'text', position: 1, huddleMeetingId: null, parentId: null, parentMessageId: null, createdAt: created },
      { id: voiceId, guildId, name: 'General', topic: '', type: 'voice', position: 2, huddleMeetingId: null, parentId: null, parentMessageId: null, createdAt: created },
    ]),
    db.insert(auditLog).values({
      id: auditId,
      guildId,
      actorId: userId,
      action: 'guild.create',
      targetType: 'guild',
      targetId: guildId,
      metaJson: JSON.stringify({ name: seed.guildName }),
      createdAt: created,
    }),
  ])

  return { userId, guildId, channelId: generalId }
}

export async function ensureAdminFromEnv(event: H3Event): Promise<{ users: number; provisioned: boolean }> {
  const { env } = cf(event)
  await ensureMigrated(env.DB)
  const users = await userCount(env.DB)
  if (users > 0) return { users, provisioned: false }
  const seed = readAdminEnv(env)
  if (!seed) return { users: 0, provisioned: false }
  await provisionWorkspace(event, seed)
  return { users: 1, provisioned: true }
}
