import { z } from 'zod'
import { createSession } from '../../utils/auth'
import { ensureAdminFromEnv, provisionWorkspace } from '../../utils/bootstrap'
import { cf, fail } from '../../utils/cf'
import { parseBody } from '../../utils/validate'

const bodySchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(80),
  guildName: z.string().min(1).max(80),
})

export default defineEventHandler(async (event) => {
  cf(event)
  const seeded = await ensureAdminFromEnv(event)
  if (seeded.users > 0) fail(409, 'already_setup', 'This space already has an owner')

  const body = parseBody(bodySchema, await readBody(event))
  const email = body.email.trim().toLowerCase()
  const displayName = body.displayName.trim()
  const created = await provisionWorkspace(event, {
    email,
    password: body.password,
    displayName,
    guildName: body.guildName.trim(),
  })
  await createSession(event, created.userId)
  return {
    user: { id: created.userId, email, displayName, avatarR2Key: null },
    guildId: created.guildId,
    channelId: created.channelId,
  }
})
