import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { invites } from '../../../drizzle/schema'
import { loadAuthRuntimeConfig, publicAuthConfig } from '../../utils/auth-config'
import { authFromEvent } from '../../utils/better-auth'
import { cf, fail } from '../../utils/cf'
import { ensureMigrated, getDb } from '../../utils/db'
import { parseBody } from '../../utils/validate'

const bodySchema = z.object({
  provider: z.enum(['github', 'twitter', 'telegram']),
  callbackURL: z.string().url().max(1000),
  errorCallbackURL: z.string().url().max(1000),
  inviteCode: z.string().trim().max(100).optional(),
})

export default defineEventHandler(async (event): Promise<{ url: string | null }> => {
  const body = parseBody(bodySchema, await readBody(event))
  const { env } = cf(event)
  const requestOrigin = getRequestURL(event).origin
  if (new URL(body.callbackURL).origin !== requestOrigin || new URL(body.errorCallbackURL).origin !== requestOrigin) {
    fail(400, 'invalid_callback', 'Authentication callbacks must use this origin')
  }
  await ensureMigrated(env.DB)
  const runtime = await loadAuthRuntimeConfig(env, requestOrigin)
  if (!publicAuthConfig(runtime).methods[body.provider]) fail(403, 'method_disabled', 'Login method is not available')

  let validInvite = false
  if (body.inviteCode) {
    const invite = (await getDb(env.DB).select().from(invites).where(eq(invites.code, body.inviteCode)).limit(1))[0]
    validInvite = Boolean(invite
      && (!invite.expiresAt || new Date(invite.expiresAt).getTime() >= Date.now())
      && (invite.maxUses === 0 || invite.uses < invite.maxUses))
  }
  const requestSignUp = runtime.registrationMode === 'open' || validInvite
  const auth = await authFromEvent(event)
  const response = await auth.api.signInSocial({
    headers: event.headers,
    body: {
      provider: body.provider,
      callbackURL: body.callbackURL,
      errorCallbackURL: body.errorCallbackURL,
      disableRedirect: true,
      requestSignUp,
    },
    asResponse: true,
  })
  if (!response.ok) fail(response.status, 'social_login_failed', 'Could not start social login')
  for (const cookie of response.headers.getSetCookie?.() ?? []) appendResponseHeader(event, 'set-cookie', cookie)
  const payload = await response.json() as { url?: string | null }
  return { url: payload.url ?? null }
})
