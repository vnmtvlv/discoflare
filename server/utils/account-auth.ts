import type { H3Event } from 'h3'
import { visibleAuthEmail } from './auth'
import { authFromEvent } from './better-auth'
import { cf, fail } from './cf'
import { emailVerificationRequired, loadAuthRuntimeConfig, publicAuthConfig } from './auth-config'
import type { AccountAuthSettings } from '../../shared/account-auth'

export async function accountAuthContext(event: H3Event) {
  const { env } = cf(event)
  const config = await loadAuthRuntimeConfig(env, getRequestURL(event).origin)
  if (config.mode === 'access') fail(400, 'managed_by_access', 'Login methods are managed by Cloudflare Access')
  const auth = await authFromEvent(event)
  const session = await auth.api.getSession({ headers: event.headers })
  if (!session) fail(401, 'unauthorized', 'Sign in first')
  const accounts = await auth.api.listUserAccounts({ headers: event.headers })
  const methods = publicAuthConfig(config).methods
  const email = visibleAuthEmail(session.user.email)
  const usableProviders = Object.entries(methods).filter(([, enabled]) => enabled).map(([provider]) => provider === 'email' ? 'credential' : provider)
    .filter(provider => provider !== 'credential' || Boolean(email && (session.user.emailVerified || !emailVerificationRequired(config))))
  return { env, config, auth, session, accounts, methods, email, usableProviders }
}

export function accountAuthSettings(context: Awaited<ReturnType<typeof accountAuthContext>>): AccountAuthSettings {
  const { config, session, accounts, methods, email, usableProviders } = context
  return {
    managed: false, email, emailVerified: Boolean(email && session.user.emailVerified),
    canAddEmail: config.email.verificationReady,
    canSetPassword: Boolean(methods.email && email && session.user.emailVerified && !accounts.some(account => account.providerId === 'credential')),
    methods,
    accounts: accounts.map(account => ({
      id: account.id, provider: account.providerId, enabled: usableProviders.includes(account.providerId),
      canRemove: accounts.some(other => other.id !== account.id && usableProviders.includes(other.providerId)),
    })),
  }
}

export async function accountAuthResponse(event: H3Event, response: Response) {
  const result = await response.json() as { url?: string, message?: string }
  if (!response.ok) fail(response.status, 'account_update_failed', result.message || 'Could not update login methods')
  for (const cookie of response.headers.getSetCookie()) appendResponseHeader(event, 'set-cookie', cookie)
  return { status: true, url: result.url ?? null }
}
