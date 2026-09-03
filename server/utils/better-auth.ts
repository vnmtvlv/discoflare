import { betterAuth } from 'better-auth'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import type { H3Event } from 'h3'
import { authAccounts, authSessions, authUsers, authVerifications } from '../../drizzle/schema'
import type { DiscoflareEnv } from '../../workers/env'
import { cf } from './cf'
import { getDb } from './db'
import { hashPassword, verifyPassword } from './password'

const DEV_SECRET = 'discoflare-dev-secret-do-not-use-in-prod!!'

export function createAuth(env: DiscoflareEnv, baseURL: string) {
  const local = ['localhost', '127.0.0.1', '::1'].includes(new URL(baseURL).hostname)
  const secret = env.AUTH_SECRET || (local ? DEV_SECRET : '')
  if (!secret) throw new Error('AUTH_SECRET is required')
  return betterAuth({
    secret,
    baseURL,
    database: drizzleAdapter(getDb(env.DB), {
      provider: 'sqlite',
      schema: {
        user: authUsers,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      password: {
        hash: async (password) => hashPassword(password),
        verify: async ({ password, hash }) => verifyPassword(password, hash),
      },
    },
    trustedOrigins: [baseURL],
    advanced: {
      cookiePrefix: 'df',
      useSecureCookies: baseURL.startsWith('https://'),
    },
  })
}

export function authFromEvent(event: H3Event) {
  const { env } = cf(event)
  return createAuth(env, getRequestURL(event).origin)
}
