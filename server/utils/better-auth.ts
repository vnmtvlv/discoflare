import { betterAuth } from 'better-auth'
import { captcha, genericOAuth } from 'better-auth/plugins'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import type { H3Event } from 'h3'
import { authAccounts, authSessions, authUsers, authVerifications } from '../../drizzle/schema'
import type { DiscoflareEnv } from '../../workers/env'
import { authSecret, credentialReady, loadAuthRuntimeConfig, publicAuthConfig } from './auth-config'
import { cf } from './cf'
import { getDb } from './db'
import { hashPassword, verifyPassword } from './password'

type TelegramClaims = {
  sub?: unknown
  name?: unknown
  preferred_username?: unknown
  picture?: unknown
}

function telegramClaims(idToken: string | undefined): TelegramClaims | null {
  if (!idToken) return null
  try {
    const encoded = idToken.split('.')[1]
    if (!encoded) return null
    const base64 = encoded.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(encoded.length / 4) * 4, '=')
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(base64), char => char.charCodeAt(0)))) as TelegramClaims
  }
  catch {
    return null
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]!)
}

async function sendVerificationEmail(env: DiscoflareEnv, from: string, fromName: string | null, to: string, url: string) {
  if (!env.EMAIL) throw new Error('Cloudflare Email Service binding is unavailable')
  const safeUrl = escapeHtml(url)
  await env.EMAIL.send({
    to,
    from: fromName ? { email: from, name: fromName } : from,
    subject: 'Verify your Discoflare email',
    text: `Verify your email address: ${url}\n\nThis link expires in one hour.`,
    html: `<p>Verify your email address to join Discoflare.</p><p><a href="${safeUrl}">Verify email</a></p><p>This link expires in one hour.</p>`,
  })
}

export async function createAuth(env: DiscoflareEnv, baseURL: string) {
  const config = await loadAuthRuntimeConfig(env, baseURL)
  const publicConfig = publicAuthConfig(config)
  const github = config.credentials.github
  const twitter = config.credentials.twitter
  const telegram = config.credentials.telegram
  const turnstile = config.credentials.turnstile

  return betterAuth({
    secret: authSecret(env, baseURL),
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
      enabled: config.enabled.email,
      disableSignUp: !config.email.verificationReady,
      requireEmailVerification: true,
      minPasswordLength: 8,
      password: {
        hash: async password => hashPassword(password),
        verify: async ({ password, hash }) => verifyPassword(password, hash),
      },
    },
    emailVerification: config.email.verificationReady
      ? {
          sendOnSignUp: true,
          sendOnSignIn: true,
          autoSignInAfterVerification: false,
          expiresIn: 60 * 60,
          sendVerificationEmail: async ({ user, url }) => {
            await sendVerificationEmail(env, config.email.from!, config.email.fromName, user.email, url)
          },
        }
      : undefined,
    socialProviders: {
      ...(publicConfig.methods.github && github
        ? { github: { clientId: github.publicKey, clientSecret: github.secret, disableImplicitSignUp: true } }
        : {}),
      ...(publicConfig.methods.twitter && twitter
        ? { twitter: { clientId: twitter.publicKey, clientSecret: twitter.secret, disableImplicitSignUp: true } }
        : {}),
    },
    plugins: [
      ...(publicConfig.methods.telegram && telegram
        ? [genericOAuth({
            config: [{
              providerId: 'telegram',
              name: 'Telegram',
              clientId: telegram.publicKey,
              clientSecret: telegram.secret,
              discoveryUrl: 'https://oauth.telegram.org/.well-known/openid-configuration',
              requireIdTokenVerification: true,
              scopes: ['openid', 'profile'],
              authentication: 'basic',
              disableImplicitSignUp: true,
              getUserInfo: async (tokens) => {
                const claims = telegramClaims(tokens.idToken)
                const sub = typeof claims?.sub === 'string' || typeof claims?.sub === 'number' ? String(claims.sub) : ''
                if (!sub) return null
                const username = typeof claims?.preferred_username === 'string' ? claims.preferred_username : ''
                return {
                  ...claims,
                  id: sub,
                  sub,
                  email: `telegram-${sub}@identity.discoflare.invalid`,
                  emailVerified: true,
                  name: typeof claims?.name === 'string' ? claims.name : username || 'Telegram member',
                  image: typeof claims?.picture === 'string' ? claims.picture : undefined,
                }
              },
            }],
          })]
        : []),
      ...(config.enabled.turnstile && credentialReady(config, 'turnstile') && turnstile
        ? [captcha({
            provider: 'cloudflare-turnstile',
            secretKey: turnstile.secret,
            endpoints: ['/sign-up/email'],
            expectedAction: 'signup',
            allowedHostnames: [new URL(baseURL).hostname],
          })]
        : []),
    ],
    trustedOrigins: [baseURL],
    advanced: {
      cookiePrefix: 'df',
      useSecureCookies: baseURL.startsWith('https://'),
    },
  })
}

export function resolveAuthBaseURL(configuredOrigin: string | undefined, requestOrigin: string) {
  const value = configuredOrigin?.trim()
  if (!value) return new URL(requestOrigin).origin

  let url: URL
  try {
    url = new URL(value)
  }
  catch {
    throw new Error('PUBLIC_ORIGIN must be an absolute HTTP or HTTPS origin')
  }

  if (
    !['http:', 'https:'].includes(url.protocol)
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
  ) {
    throw new Error('PUBLIC_ORIGIN must contain only an HTTP or HTTPS origin')
  }

  return url.origin
}

export async function authFromEvent(event: H3Event) {
  const { env } = cf(event)
  return createAuth(env, resolveAuthBaseURL(env.PUBLIC_ORIGIN, getRequestURL(event).origin))
}
