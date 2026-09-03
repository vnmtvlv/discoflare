import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { guilds } from '../../../drizzle/schema'
import { Permission } from '../../../shared/permissions'
import { requireMember } from '../../utils/guards'
import { cf } from '../../utils/cf'
import { getDb } from '../../utils/db'
import { parseBody } from '../../utils/validate'
import { writeAudit } from '../../utils/messages'

const bodySchema = z.object({
  name: z.string().min(1).max(80).optional(),
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const member = await requireMember(event, id, Permission.manageGuild)
  const body = parseBody(bodySchema, await readBody(event))
  const { env } = cf(event)
  const db = getDb(env.DB)
  if (body.name) {
    await db.update(guilds).set({ name: body.name.trim() }).where(eq(guilds.id, id))
    await writeAudit(env, { guildId: id, actorId: member.user.id, action: 'guild.update', targetType: 'guild', targetId: id })
  }
  const row = (await db.select().from(guilds).where(eq(guilds.id, id)).limit(1))[0]
  return { guild: row }
})
