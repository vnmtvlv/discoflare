import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { channels } from '../../../drizzle/schema'
import { Permission } from '../../../shared/permissions'
import { requireChannelMember } from '../../utils/guards'
import { cf } from '../../utils/cf'
import { getDb } from '../../utils/db'
import { parseBody } from '../../utils/validate'

const bodySchema = z.object({
  name: z.string().min(1).max(80).optional(),
  topic: z.string().max(200).optional(),
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  await requireChannelMember(event, id, Permission.manageChannels)
  const body = parseBody(bodySchema, await readBody(event))
  const { env } = cf(event)
  const db = getDb(env.DB)
  const patch: { name?: string; topic?: string } = {}
  if (body.name) patch.name = body.name.toLowerCase()
  if (body.topic !== undefined) patch.topic = body.topic
  if (Object.keys(patch).length) await db.update(channels).set(patch).where(eq(channels.id, id))
  const row = (await db.select().from(channels).where(eq(channels.id, id)).limit(1))[0]
  return { channel: row }
})
