import { and, eq, inArray } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { channels, dmParticipants, guildMembers, guilds, roles, users } from '../../drizzle/schema'
import { ALL_PERMISSIONS, hasPermission, MemberPermissions, Permission, type PermissionFlag } from '../../shared/permissions'
import type { PublicUser } from '../../shared/types'
import { isDmType, normalizeChannelType } from '../../shared/dm'
import { requireUser } from './auth'
import { cf, fail } from './cf'
import { getDb } from './db'
import { toPublicUser } from './messages'

export type Membership = {
  user: PublicUser
  guildId: string
  roleId: string
  roleName: string
  perms: number
  ownerId: string
  isOwner: boolean
}

export type ChannelAccess = Membership & {
  channel: typeof channels.$inferSelect
  frozen: boolean
  participants: PublicUser[]
}

export async function requireMember(event: H3Event, guildId: string, flag?: PermissionFlag): Promise<Membership> {
  const user = await requireUser(event)
  const { env } = cf(event)
  const db = getDb(env.DB)
  const rows = await db.select({
    roleId: guildMembers.roleId,
    roleName: roles.name,
    perms: roles.permissionsBitmask,
    ownerId: guilds.ownerId,
  }).from(guildMembers)
    .innerJoin(roles, eq(roles.id, guildMembers.roleId))
    .innerJoin(guilds, eq(guilds.id, guildMembers.guildId))
    .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, user.id)))
    .limit(1)

  const row = rows[0]
  if (!row) fail(403, 'forbidden', 'Not a member of this guild')
  const isOwner = row.ownerId === user.id
  const perms = isOwner ? ALL_PERMISSIONS : row.perms
  if (flag !== undefined && !hasPermission(perms, flag)) {
    fail(403, 'forbidden', 'Missing permission')
  }
  return {
    user,
    guildId,
    roleId: row.roleId,
    roleName: row.roleName,
    perms,
    ownerId: row.ownerId,
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

  const type = normalizeChannelType(channel.type)
  let dmRootId = channel.id
  if (type === 'thread' && channel.parentId) {
    const parent = (await db.select().from(channels).where(eq(channels.id, channel.parentId)).limit(1))[0]
    if (parent && isDmType(parent.type)) dmRootId = parent.id
    else {
      const member = await requireMember(event, channel.guildId, flag)
      return { ...member, channel, frozen: false, participants: [] }
    }
  }

  if (type === 'dm' || (type === 'thread' && dmRootId !== channel.id)) {
    const part = (await db.select().from(dmParticipants).where(and(eq(dmParticipants.channelId, dmRootId), eq(dmParticipants.userId, user.id))).limit(1))[0]
    if (!part) fail(404, 'not_found', 'Channel not found')
    const parts = await db.select().from(dmParticipants).where(eq(dmParticipants.channelId, dmRootId))
    const userRows = await db.select().from(users).where(inArray(users.id, parts.map((p) => p.userId)))
    const participants = userRows.map(toPublicUser)
    const memberRows = await db.select({ userId: guildMembers.userId }).from(guildMembers)
      .where(and(eq(guildMembers.guildId, channel.guildId), inArray(guildMembers.userId, parts.map((p) => p.userId))))
    const stillIn = new Set(memberRows.map((m) => m.userId))
    const frozen = parts.some((p) => !stillIn.has(p.userId))
    const guild = (await db.select().from(guilds).where(eq(guilds.id, channel.guildId)).limit(1))[0]
    const perms = frozen ? 0 : (MemberPermissions | Permission.startHuddle)
    if (flag !== undefined && !frozen && !hasPermission(perms, flag) && flag !== Permission.sendMessages) {
      fail(403, 'forbidden', 'Missing permission')
    }
    if (flag === Permission.sendMessages && frozen) fail(403, 'forbidden', 'You can no longer send messages to this user')
    return {
      user,
      guildId: channel.guildId,
      roleId: '',
      roleName: 'member',
      perms,
      ownerId: guild?.ownerId ?? '',
      isOwner: guild?.ownerId === user.id,
      channel,
      frozen,
      participants,
    }
  }

  const member = await requireMember(event, channel.guildId, flag)
  return { ...member, channel, frozen: false, participants: [] }
}
