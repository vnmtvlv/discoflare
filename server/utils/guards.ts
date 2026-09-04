import { and, eq, inArray } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { channelRoleOverrides, channels, channelMembers, roles, users, workspace } from '../../drizzle/schema'
import { resolveChannelPermissions } from '../../shared/channel-permissions'
import { WORKSPACE_ID } from '../../shared/ids'
import { ALL_PERMISSIONS, hasPermission, MemberPermissions, Permission, type PermissionFlag } from '../../shared/permissions'
import type { ChannelType, PublicUser } from '../../shared/types'
import { requireUser } from './auth'
import { cf, fail } from './cf'
import { getDb } from './db'
import { toPublicUser } from './messages'

export type Membership = {
  user: PublicUser
  workspaceId: string
  roleId: string
  roleName: string
  perms: number
  ownerId: string
  isOwner: boolean
}

export type ChannelAccess = Membership & {
  channel: typeof channels.$inferSelect
  accessRootType: ChannelType
  frozen: boolean
  participants: PublicUser[]
}

export async function requireMember(event: H3Event, workspaceId: string, flag?: PermissionFlag): Promise<Membership> {
  if (workspaceId !== WORKSPACE_ID) fail(404, 'not_found', 'Workspace not found')
  const user = await requireUser(event)
  const { env } = cf(event)
  const db = getDb(env.DB)
  const rows = await db.select({
    roleId: users.roleId,
    roleName: roles.name,
    perms: roles.permissionsBitmask,
  }).from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(and(eq(users.id, user.id), eq(users.status, 'active')))
    .limit(1)

  const row = rows[0]
  if (!row) fail(403, 'forbidden', 'Not a member of this workspace')
  const home = (await db.select({ ownerId: workspace.ownerId }).from(workspace).where(eq(workspace.id, WORKSPACE_ID)).limit(1))[0]
  if (!home) fail(404, 'not_found', 'Workspace not found')
  const isOwner = home.ownerId === user.id
  const perms = isOwner ? ALL_PERMISSIONS : row.perms
  if (flag !== undefined && !hasPermission(perms, flag)) {
    fail(403, 'forbidden', 'Missing permission')
  }
  return {
    user,
    workspaceId,
    roleId: row.roleId!,
    roleName: row.roleName,
    perms,
    ownerId: home.ownerId,
    isOwner,
  }
}

export async function requireChannelMember(event: H3Event, channelId: string, flag?: PermissionFlag) {
  return requireChannelAccess(event, channelId, flag)
}

export async function requireChannelAccess(event: H3Event, channelId: string, flag?: PermissionFlag): Promise<ChannelAccess> {
  const user = await requireUser(event)
  const { env } = cf(event)
  const db = getDb(env.DB)
  const channel = (await db.select().from(channels).where(eq(channels.id, channelId)).limit(1))[0]
  if (!channel) fail(404, 'not_found', 'Channel not found')

  const type = channel.type
  let accessRoot = channel
  if (type === 'thread' && channel.parentId) {
    const parent = (await db.select().from(channels).where(eq(channels.id, channel.parentId)).limit(1))[0]
    if (!parent) fail(404, 'not_found', 'Parent channel not found')
    accessRoot = parent
  }

  const rootType = accessRoot.type
  const baseMember = await requireMember(event, WORKSPACE_ID)

  if (accessRoot.visibility === 'private') {
    const part = (await db.select().from(channelMembers).where(and(eq(channelMembers.channelId, accessRoot.id), eq(channelMembers.userId, user.id))).limit(1))[0]
    if (!part) fail(404, 'not_found', 'Channel not found')
  }

  if (rootType === 'dm') {
    const parts = await db.select().from(channelMembers).where(eq(channelMembers.channelId, accessRoot.id))
    const userRows = await db.select().from(users).where(inArray(users.id, parts.map((p) => p.userId)))
    const participants = userRows.map(toPublicUser)
    const canManageAgents = baseMember.isOwner || hasPermission(baseMember.perms, Permission.manageWorkspace)
    if (participants.some(participant => participant.kind === 'agent') && !canManageAgents) {
      fail(404, 'not_found', 'Channel not found')
    }
    const memberRows = await db.select({ userId: users.id }).from(users)
      .where(and(inArray(users.id, parts.map((p) => p.userId)), eq(users.status, 'active')))
    const stillIn = new Set(memberRows.map((m) => m.userId))
    const frozen = parts.some((p) => !stillIn.has(p.userId))
    const perms = frozen ? 0 : (MemberPermissions | Permission.startHuddle)
    if (flag !== undefined && !frozen && !hasPermission(perms, flag) && flag !== Permission.sendMessages) {
      fail(403, 'forbidden', 'Missing permission')
    }
    if (flag === Permission.sendMessages && frozen) fail(403, 'forbidden', 'You can no longer send messages to this user')
    return {
      user,
      workspaceId: WORKSPACE_ID,
      roleId: '',
      roleName: 'member',
      perms,
      ownerId: baseMember.ownerId,
      isOwner: baseMember.isOwner,
      channel,
      accessRootType: rootType,
      frozen,
      participants,
    }
  }

  let perms = baseMember.perms
  if (!baseMember.isOwner) {
    const override = (await db.select({
      allow: channelRoleOverrides.allowMask,
      deny: channelRoleOverrides.denyMask,
    }).from(channelRoleOverrides).where(and(
      eq(channelRoleOverrides.channelId, accessRoot.id),
      eq(channelRoleOverrides.roleId, baseMember.roleId),
    )).limit(1))[0]
    perms = resolveChannelPermissions(perms, override)
  }
  if (flag !== undefined && !hasPermission(perms, flag)) {
    fail(403, 'forbidden', 'Missing permission')
  }

  return { ...baseMember, perms, channel, accessRootType: rootType, frozen: false, participants: [] }
}
