import { z } from 'zod'
import { accountAuthContext, accountAuthResponse } from '../../utils/account-auth'
import { requireFreshAccountSession, removeAccountLogin } from '../../utils/account-security'
import { asRpc, fail } from '../../utils/cf'
import { parseBody } from '../../utils/validate'

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('link'), provider: z.enum(['github', 'google', 'twitter', 'telegram', 'linkedin']) }),
  z.object({ action: z.literal('unlink'), accountId: z.string().min(1).max(200) }),
  z.object({ action: z.literal('email'), email: z.string().trim().toLowerCase().email().max(200).refine(value => !value.endsWith('.invalid'), 'Use a real email address') }),
  z.object({ action: z.literal('password'), password: z.string().min(8).max(200) }),
])

export default defineEventHandler(async (event) => {
  const body = parseBody(schema, await readBody(event))
  const { env, config, auth, session, methods, email, usableProviders } = await accountAuthContext(event)
  requireFreshAccountSession(session)
  if (env.RATE_LIMIT_DO) {
    const limiter = asRpc<{ take: (limit: number, windowMs: number) => Promise<boolean> }>(env.RATE_LIMIT_DO.getByName(`user:${session.user.id}:account:${body.action}`))
    if (!await limiter.take(5, 60 * 1000)) fail(429, 'rate_limited', 'Too many account changes. Try again in a minute.')
  }
  const headers = event.headers
  const callbackURL = '/settings?section=account'
  if (body.action === 'link') {
    if (!methods[body.provider]) fail(403, 'method_disabled', 'This login method is not enabled by the workspace owner')
    return accountAuthResponse(event, await auth.api.linkSocialAccount({ headers, body: { provider: body.provider, callbackURL, errorCallbackURL: `${callbackURL}&link=failed`, disableRedirect: true }, asResponse: true }))
  }
  if (body.action === 'unlink') {
    await removeAccountLogin(env.DB, session.user.id, body.accountId, usableProviders)
    return { status: true }
  }
  if (body.action === 'email') {
    if (!config.email.verificationReady) fail(503, 'email_unavailable', 'The workspace owner must configure email delivery first')
    if (body.email === session.user.email && !session.user.emailVerified) {
      return accountAuthResponse(event, await auth.api.sendVerificationEmail({ headers, body: { email: body.email, callbackURL }, asResponse: true }))
    }
    return accountAuthResponse(event, await auth.api.changeEmail({ headers, body: { newEmail: body.email, callbackURL }, asResponse: true }))
  }
  if (!methods.email || !email || !session.user.emailVerified) fail(403, 'email_not_verified', 'Add and verify an email before setting a password')
  return accountAuthResponse(event, await auth.api.setPassword({ headers, body: { newPassword: body.password }, asResponse: true }))
})
