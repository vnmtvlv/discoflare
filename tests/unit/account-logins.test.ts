import { DatabaseSync } from 'node:sqlite'
import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuth } from '../../server/utils/better-auth'
import { INIT_SQL } from '../../server/utils/db'
import { removeAccountLogin, requireFreshAccountSession } from '../../server/utils/account-security'
import type { AuthRuntimeConfig } from '../../server/utils/auth-config'
import { authD1, cookies } from '../helpers/auth-d1'

const origin = 'http://localhost:3000'
const secret = 'test-only-secret-with-more-than-32-characters'
let sqlite: DatabaseSync
let messages: Array<{ to: string, text: string }>
let tasks: Promise<unknown>[]
let auth: Awaited<ReturnType<typeof createAuth>>
let userId: string
let headers: Headers

beforeEach(async () => {
  vi.stubGlobal('createError', (options: { statusMessage: string, statusCode: number }) => Object.assign(new Error(options.statusMessage), options))
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(INIT_SQL)
  messages = []; tasks = []
  const config: AuthRuntimeConfig = {
    mode: 'builtin', registrationMode: 'invite_only',
    enabled: { email: true, google: false, linkedin: false, github: true, twitter: false, telegram: false, turnstile: false },
    credentials: { github: { publicKey: 'test-client', secret: 'test-secret', source: 'database', secretReadable: true } },
    email: { binding: true, from: 'login@example.test', fromName: 'Test', senderManagedByDeployment: false, verificationReady: true },
  }
  auth = await createAuth({ DB: authD1(sqlite), AUTH_SECRET: secret, EMAIL: { send: async (message: { to: string, text: string }) => { messages.push(message) } } } as never, origin, promise => tasks.push(promise), config)
  const ctx = await auth.$context
  const user = await ctx.internalAdapter.createUser({ name: 'Telegram member', email: 'telegram-123@identity.discoflare.invalid', emailVerified: true }, { method: 'test' })
  userId = user.id
  await ctx.internalAdapter.createAccount({ userId, providerId: 'telegram', issuer: 'https://oauth.telegram.org', accountId: '123' })
  const session = (await ctx.internalAdapter.createSession(userId))!
  const signature = createHmac('sha256', secret).update(session.token).digest('base64')
  headers = new Headers({ cookie: `df.session_token=${encodeURIComponent(`${session.token}.${signature}`)}`, origin })
})

afterEach(() => { sqlite.close(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

async function githubCallback(accountId: string, email = 'github@example.test', emailVerified = true) {
  const ctx = await auth.$context
  const provider = ctx.socialProviders.find(provider => provider.id === 'github')!
  provider.validateAuthorizationCode = vi.fn(async () => ({ accessToken: 'test-token' }))
  provider.getUserInfo = vi.fn(async () => ({ user: { id: accountId, name: 'GitHub member', email, emailVerified }, data: { id: accountId } }))
  const start = await auth.api.linkSocialAccount({ headers, body: { provider: 'github', callbackURL: '/settings?section=account', errorCallbackURL: '/settings?link=failed', disableRedirect: true }, asResponse: true })
  expect(start.status).toBe(200)
  const { url } = await start.json() as { url: string }
  const state = new URL(url).searchParams.get('state')!
  const callbackHeaders = new Headers(headers)
  callbackHeaders.set('cookie', `${headers.get('cookie')}; ${cookies(start)}`)
  return auth.handler(new Request(`${origin}/api/auth/callback/github?code=test-code&state=${encodeURIComponent(state)}`, { headers: callbackHeaders }))
}

describe('member login methods', () => {
  it('attaches a verified email to a Telegram member, then adds a password without replacing the identity', async () => {
    const start = await auth.api.changeEmail({ headers, body: { newEmail: 'member@example.test', callbackURL: '/settings?section=account' }, asResponse: true })
    expect(start.status).toBe(200)
    await Promise.all(tasks)
    expect(sqlite.prepare('SELECT email FROM auth_users WHERE id = ?').get(userId)).toMatchObject({ email: 'telegram-123@identity.discoflare.invalid' })
    expect(messages[0]?.to).toBe('member@example.test')
    const link = messages[0]!.text.match(/http:\/\/\S+/)![0]!
    const verified = await auth.handler(new Request(link, { headers }))
    expect(verified.status).toBe(302)
    expect(sqlite.prepare('SELECT id, email, email_verified FROM auth_users WHERE id = ?').get(userId)).toMatchObject({ id: userId, email: 'member@example.test', email_verified: 1 })
    const password = await auth.api.setPassword({ headers, body: { newPassword: 'new-member-password' }, asResponse: true })
    expect(password.status).toBe(200)
    const login = await auth.api.signInEmail({ body: { email: 'member@example.test', password: 'new-member-password' }, asResponse: true })
    expect(login.status).toBe(200)
    expect((await login.json()).user.id).toBe(userId)
    expect(sqlite.prepare('SELECT provider_id FROM auth_accounts WHERE user_id = ? ORDER BY provider_id').all(userId)).toEqual([{ provider_id: 'credential' }, { provider_id: 'telegram' }])
  })

  it('links a provider with a different verified email to the existing member', async () => {
    const response = await githubCallback('github-123')
    expect(response.headers.get('location')).toContain('/settings?section=account')
    expect(sqlite.prepare("SELECT user_id FROM auth_accounts WHERE provider_id = 'github'").get()).toMatchObject({ user_id: userId })
    expect(sqlite.prepare('SELECT count(*) AS count FROM auth_users').get()).toMatchObject({ count: 1 })
  })

  it('rejects an unverified provider identity', async () => {
    const response = await githubCallback('unverified', 'unverified@example.test', false)
    expect(response.headers.get('location')).toContain('error=')
    expect(sqlite.prepare("SELECT count(*) AS count FROM auth_accounts WHERE provider_id = 'github'").get()).toMatchObject({ count: 0 })
  })

  it('does not merge two existing members when a provider belongs to someone else', async () => {
    const ctx = await auth.$context
    const other = await ctx.internalAdapter.createUser({ name: 'Other member', email: 'other@example.test', emailVerified: true }, { method: 'test' })
    await ctx.internalAdapter.createAccount({ userId: other.id, providerId: 'github', issuer: 'local:oauth:github', accountId: 'taken' })
    const response = await githubCallback('taken', 'other@example.test')
    expect(response.headers.get('location')).toContain('error=')
    expect(sqlite.prepare("SELECT user_id FROM auth_accounts WHERE provider_id = 'github'").get()).toMatchObject({ user_id: other.id })
  })

  it('keeps a taken email on its original member', async () => {
    const ctx = await auth.$context
    const other = await ctx.internalAdapter.createUser({ name: 'Other', email: 'taken@example.test', emailVerified: true }, { method: 'test' })
    await auth.api.changeEmail({ headers, body: { newEmail: 'taken@example.test' }, asResponse: true })
    await Promise.all(tasks)
    expect(messages).toHaveLength(0)
    expect((await ctx.internalAdapter.findUserById(userId))!.email).toBe('telegram-123@identity.discoflare.invalid')
    expect((await ctx.internalAdapter.findUserById(other.id))!.email).toBe('taken@example.test')
  })

  it('prevents stale sessions and unauthenticated account changes', () => {
    expect(() => requireFreshAccountSession(null)).toThrow('Sign in')
    expect(() => requireFreshAccountSession({ session: { createdAt: new Date(Date.now() - 16 * 60 * 1000) }, user: { id: userId } })).toThrow('Sign out')
  })

  it('does not count disabled methods or another member when protecting the last login', async () => {
    const account = sqlite.prepare('SELECT id FROM auth_accounts WHERE user_id = ?').get(userId) as { id: string }
    await expect(removeAccountLogin(authD1(sqlite), userId, account.id, ['telegram'])).rejects.toThrow('Keep at least one')
    await expect(removeAccountLogin(authD1(sqlite), 'another-user', account.id, ['telegram'])).rejects.toThrow('Keep at least one')
  })

  it('serializes competing removals so at least one usable login remains', async () => {
    await githubCallback('github-123')
    const accounts = sqlite.prepare('SELECT id FROM auth_accounts WHERE user_id = ?').all(userId) as Array<{ id: string }>
    const results = await Promise.allSettled(accounts.map(account => removeAccountLogin(authD1(sqlite), userId, account.id, ['telegram', 'github'])))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(sqlite.prepare('SELECT count(*) AS count FROM auth_accounts WHERE user_id = ?').get(userId)).toMatchObject({ count: 1 })
  })
})
