import { eq } from 'drizzle-orm'
import { attachments } from '../../../drizzle/schema'
import { requireChannelMember } from '../../utils/guards'
import { cf, fail } from '../../utils/cf'
import { getDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { env } = cf(event)
  const db = getDb(env.DB)
  const row = (await db.select().from(attachments).where(eq(attachments.id, id)).limit(1))[0]
  if (!row) fail(404, 'not_found', 'File not found')
  const channelId = row.r2Key.split('/')[1]
  if (channelId) await requireChannelMember(event, channelId)
  else fail(403, 'forbidden', 'Cannot access file')
  const obj = await env.FILES.get(row.r2Key)
  if (!obj) fail(404, 'not_found', 'Blob missing')
  setHeader(event, 'Content-Type', row.contentType)
  setHeader(event, 'Content-Disposition', `inline; filename="${row.filename.replaceAll('"', '')}"`)
  setHeader(event, 'Cache-Control', 'private, max-age=3600')
  return obj.body
})
