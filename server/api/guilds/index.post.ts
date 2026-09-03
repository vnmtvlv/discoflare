import { z } from 'zod'
import { ALL_PERMISSIONS, MemberPermissions } from '../../../shared/permissions'
import { newId, nowIso } from '../../../shared/ids'
import { channels, guildMembers, guilds, roles } from '../../../drizzle/schema'
import { requireUser } from '../../utils/auth'
import { cf } from '../../utils/cf'
import { getDb } from '../../utils/db'
import { parseBody } from '../../utils/validate'
import { writeAudit } from '../../utils/messages'

const bodySchema = z.object({
  name: z.string().min(1).max(80),
})

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = parseBody(bodySchema, await readBody(event))
  const { env } = cf(event)
  const db = getDb(env.DB)
  const guildId = newId()
  const ownerRoleId = newId()
  const created = nowIso()
  await db.insert(guilds).values({
    id: guildId,
    name: body.name.trim(),
    iconR2Key: null,
    ownerId: user.id,
    createdAt: created,
  })
  await db.insert(roles).values([
    { id: ownerRoleId, guildId, name: 'owner', permissionsBitmask: ALL_PERMISSIONS, position: 0, createdAt: created },
    { id: newId(), guildId, name: 'admin', permissionsBitmask: ALL_PERMISSIONS, position: 1, createdAt: created },
    { id: newId(), guildId, name: 'member', permissionsBitmask: MemberPermissions, position: 2, createdAt: created },
  ])
  await db.insert(guildMembers).values({
    guildId,
    userId: user.id,
    roleId: ownerRoleId,
    lastSeenAt: created,
    nickname: null,
  })
  const generalId = newId()
  await db.insert(channels).values([
    { id: generalId, guildId, name: 'general', topic: '', type: 'text', position: 0, huddleMeetingId: null, parentId: null, parentMessageId: null, createdAt: created },
    { id: newId(), guildId, name: 'random', topic: '', type: 'text', position: 1, huddleMeetingId: null, parentId: null, parentMessageId: null, createdAt: created },
    { id: newId(), guildId, name: 'General', topic: '', type: 'voice', position: 2, huddleMeetingId: null, parentId: null, parentMessageId: null, createdAt: created },
  ])
  await writeAudit(env, { guildId, actorId: user.id, action: 'guild.create', targetType: 'guild', targetId: guildId })
  return { guild: { id: guildId, name: body.name.trim(), iconR2Key: null, ownerId: user.id, createdAt: created }, channelId: generalId }
})
