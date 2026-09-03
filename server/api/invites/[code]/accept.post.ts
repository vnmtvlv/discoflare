import { and, eq } from 'drizzle-orm'
import { channels, guildMembers, invites, roles } from '../../../../drizzle/schema'
import { nowIso } from '../../../../shared/ids'
import { requireUser } from '../../../utils/auth'
import { cf, fail } from '../../../utils/cf'
import { getDb } from '../../../utils/db'
import { writeAudit } from '../../../utils/messages'

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code')!
  const user = await requireUser(event)
  const { env } = cf(event)
  const db = getDb(env.DB)
  const invite = (await db.select().from(invites).where(eq(invites.code, code)).limit(1))[0]
  if (!invite) fail(404, 'not_found', 'Invite not found')
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) fail(410, 'expired', 'Invite expired')
  if (invite.maxUses > 0 && invite.uses >= invite.maxUses) fail(410, 'exhausted', 'Invite already used')

  const existing = (await db.select().from(guildMembers).where(and(eq(guildMembers.guildId, invite.guildId), eq(guildMembers.userId, user.id))).limit(1))[0]
  if (!existing) {
    const memberRole = (await db.select().from(roles).where(and(eq(roles.guildId, invite.guildId), eq(roles.name, 'member'))).limit(1))[0]
    if (!memberRole) fail(500, 'internal', 'Member role missing')
    await db.insert(guildMembers).values({
      guildId: invite.guildId,
      userId: user.id,
      roleId: memberRole.id,
      lastSeenAt: nowIso(),
      nickname: null,
    })
    await db.update(invites).set({ uses: invite.uses + 1 }).where(eq(invites.code, code))
    await writeAudit(env, { guildId: invite.guildId, actorId: user.id, action: 'member.join', targetType: 'user', targetId: user.id })
  }

  const general = (await db.select().from(channels).where(and(eq(channels.guildId, invite.guildId), eq(channels.name, 'general'))).limit(1))[0]
  const first = general ?? (await db.select().from(channels).where(eq(channels.guildId, invite.guildId)).limit(1))[0]
  return { guildId: invite.guildId, channelId: first?.id ?? null }
})
