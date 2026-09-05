import { z } from 'zod'
import { nowIso } from '../../../../shared/ids'
import { requireMailboxPermission } from '../../../utils/workspace-mail'
import { cf, fail } from '../../../utils/cf'
import { parseBody } from '../../../utils/validate'

const schema = z.object({ status: z.enum(['inbox', 'archive', 'spam', 'trash']) })

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const access = await requireMailboxPermission(event, id, 'send')
  if (access.channel.type !== 'thread') fail(404, 'not_found', 'Email conversation not found')
  const body = parseBody(schema, await readBody(event))
  const { env } = cf(event)
  await env.DB.prepare('UPDATE email_threads SET status = ?, updated_at = ? WHERE channel_id = ?').bind(body.status, nowIso(), id).run()
  return { ok: true }
})
