import { eq } from 'drizzle-orm'
import { channels } from '../../../../drizzle/schema'
import { requireChannelAccess } from '../../../utils/guards'
import { cf } from '../../../utils/cf'
import { getDb } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const parentId = getRouterParam(event, 'id')!
  await requireChannelAccess(event, parentId)
  const { env } = cf(event)
  const db = getDb(env.DB)
  const rows = await db.select().from(channels).where(eq(channels.parentId, parentId))
  return { threads: rows }
})
