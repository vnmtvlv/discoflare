import type { H3Event } from 'h3'
import { ALL_PERMISSIONS, MemberPermissions } from '../../shared/permissions'
import { newId, nowIso, WORKSPACE_ID } from '../../shared/ids'
import { authAccounts, authUsers, auditLog, channels, roles, users, workspace } from '../../drizzle/schema'
import { cf } from './cf'
import { ensureMigrated, getDb, userCount } from './db'
import { hashPassword } from './password'
import type { DiscoflareEnv } from '../../workers/env'

export type AdminSeed = {
  email: string
  password: string
  handle: string
  displayName: string
  workspaceName: string
}

export function readAdminEnv(env: Pick<DiscoflareEnv, 'ADMIN_EMAIL' | 'ADMIN_PASSWORD' | 'ADMIN_NAME' | 'ADMIN_HANDLE' | 'ADMIN_WORKSPACE'>): AdminSeed | null {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase() || ''
  const password = env.ADMIN_PASSWORD || ''
  if (!email.includes('@') || password.length < 8) return null
  const localPart = email.split('@')[0] || 'admin'
  const handle = (env.ADMIN_HANDLE?.trim() || localPart).slice(0, 32)
  const displayName = (env.ADMIN_NAME?.trim() || handle).slice(0, 80)
  const workspaceName = (env.ADMIN_WORKSPACE?.trim() || 'HQ').slice(0, 80)
  return { email, password, handle, displayName, workspaceName }
}

export async function provisionWorkspace(event: H3Event, seed: AdminSeed) {
  const { env } = cf(event)
  const db = getDb(env.DB)
  const userId = newId()
  const accountId = newId()
  const workspaceId = WORKSPACE_ID
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
    db.insert(authUsers).values({
      id: userId,
      name: seed.displayName,
      email: seed.email,
      emailVerified: true,
      image: null,
      createdAt: authCreated,
      updatedAt: authCreated,
    }),
    db.insert(authAccounts).values({
      id: accountId,
      issuer: 'local:credential',
      accountId: userId,
      providerId: 'credential',
      userId,
      password: passwordHash,
      createdAt: authCreated,
      updatedAt: authCreated,
    }),
    db.insert(roles).values([
      { id: ownerRoleId, key: 'owner', name: 'owner', permissionsBitmask: ALL_PERMISSIONS, position: 0, isSystem: true, createdAt: created, updatedAt: created },
      { id: adminRoleId, key: 'admin', name: 'admin', permissionsBitmask: ALL_PERMISSIONS, position: 1, isSystem: true, createdAt: created, updatedAt: created },
      { id: memberRoleId, key: 'member', name: 'member', permissionsBitmask: MemberPermissions, position: 2, isSystem: true, createdAt: created, updatedAt: created },
    ]),
    db.insert(users).values({
      id: userId,
      handle: seed.handle,
      displayName: seed.displayName,
      avatarR2Key: null,
      status: 'active',
      roleId: ownerRoleId,
      nickname: null,
      joinedAt: created,
      createdAt: created,
      updatedAt: created,
    }),
    db.insert(workspace).values({
      id: workspaceId,
      name: seed.workspaceName,
      iconR2Key: null,
      ownerId: userId,
      createdAt: created,
      updatedAt: created,
    }),
    db.insert(channels).values([
      { id: generalId, name: 'general', topic: '', type: 'text', visibility: 'workspace', position: 0, huddleMeetingId: null, parentId: null, parentMessageId: null, createdAt: created, updatedAt: created },
      { id: randomId, name: 'random', topic: '', type: 'text', visibility: 'workspace', position: 1, huddleMeetingId: null, parentId: null, parentMessageId: null, createdAt: created, updatedAt: created },
      { id: voiceId, name: 'General', topic: '', type: 'voice', visibility: 'workspace', position: 2, huddleMeetingId: null, parentId: null, parentMessageId: null, createdAt: created, updatedAt: created },
    ]),
    db.insert(auditLog).values({
      id: auditId,
      actorId: userId,
      action: 'workspace.create',
      targetType: 'workspace',
      targetId: workspaceId,
      metaJson: JSON.stringify({ name: seed.workspaceName }),
      createdAt: created,
    }),
  ])

  return { userId, workspaceId, channelId: generalId }
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
