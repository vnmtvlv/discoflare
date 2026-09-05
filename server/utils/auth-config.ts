import { eq } from 'drizzle-orm'
import { authProviderCredentials, authSettings } from '../../drizzle/schema'
import type { AuthCredentialProvider, AuthLoginMethod, AuthSettingsAdminDTO, PublicAuthConfig, RegistrationMode } from '../../shared/types'
import { nowIso } from '../../shared/ids'
import type { DiscoflareEnv } from '../../workers/env'
import { decryptAuthSecret } from './auth-secrets'
import { getDb } from './db'

export const AUTH_PROVIDERS = ['github', 'twitter', 'telegram', 'turnstile'] as const satisfies readonly AuthCredentialProvider[]
export const LOGIN_METHODS = ['email', 'github', 'twitter', 'telegram'] as const satisfies readonly AuthLoginMethod[]
export const DEV_AUTH_SECRET = 'discoflare-dev-secret-do-not-use-in-prod!!'

type Credential = {
  publicKey: string
  secret: string
  source: 'deployment' | 'database'
  secretReadable: boolean
}

export type AuthRuntimeConfig = {
  registrationMode: RegistrationMode
  enabled: Record<AuthLoginMethod | 'turnstile', boolean>
  credentials: Partial<Record<AuthCredentialProvider, Credential>>
  email: {
    binding: boolean
    from: string | null
    fromName: string | null
    senderManagedByDeployment: boolean
    verificationReady: boolean
  }
}

export function authSecret(env: DiscoflareEnv, baseURL?: string): string {
  const local = baseURL ? ['localhost', '127.0.0.1', '::1'].includes(new URL(baseURL).hostname) : false
  const secret = env.AUTH_SECRET || (local ? DEV_AUTH_SECRET : '')
  if (!secret) throw new Error('AUTH_SECRET is required')
  return secret
}

function envCredential(env: DiscoflareEnv, provider: AuthCredentialProvider): Credential | null {
  const pair = provider === 'github'
    ? [env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET]
    : provider === 'twitter'
      ? [env.TWITTER_CLIENT_ID, env.TWITTER_CLIENT_SECRET]
      : provider === 'telegram'
        ? [env.TELEGRAM_CLIENT_ID, env.TELEGRAM_CLIENT_SECRET]
        : [env.TURNSTILE_SITE_KEY, env.TURNSTILE_SECRET_KEY]
  const publicKey = pair[0]?.trim()
  const secret = pair[1]?.trim()
  return publicKey && secret ? { publicKey, secret, source: 'deployment', secretReadable: true } : null
}

function registrationDefault(env: DiscoflareEnv): RegistrationMode {
  return env.AUTH_REGISTRATION_MODE?.trim() === 'open' ? 'open' : 'invite_only'
}

async function ensureSettings(env: DiscoflareEnv) {
  const db = getDb(env.DB)
  const existing = (await db.select().from(authSettings).where(eq(authSettings.id, 'main')).limit(1))[0]
  if (existing) return existing
  const created = nowIso()
  await db.insert(authSettings).values({
    id: 'main',
    registrationMode: registrationDefault(env),
    emailEnabled: true,
    githubEnabled: Boolean(envCredential(env, 'github')),
    twitterEnabled: Boolean(envCredential(env, 'twitter')),
    telegramEnabled: Boolean(envCredential(env, 'telegram')),
    turnstileEnabled: Boolean(envCredential(env, 'turnstile')),
    emailFrom: null,
    emailFromName: null,
    createdAt: created,
    updatedAt: created,
  }).onConflictDoNothing()
  return (await db.select().from(authSettings).where(eq(authSettings.id, 'main')).limit(1))[0]!
}

export async function loadAuthRuntimeConfig(env: DiscoflareEnv, baseURL?: string): Promise<AuthRuntimeConfig> {
  const db = getDb(env.DB)
  const settings = await ensureSettings(env)
  const stored = await db.select().from(authProviderCredentials)
  const credentials: Partial<Record<AuthCredentialProvider, Credential>> = {}
  const secret = authSecret(env, baseURL)

  await Promise.all(AUTH_PROVIDERS.map(async (provider) => {
    const deployment = envCredential(env, provider)
    if (deployment) {
      credentials[provider] = deployment
      return
    }
    const row = stored.find(item => item.provider === provider)
    if (!row) return
    try {
      credentials[provider] = {
        publicKey: row.publicKey,
        secret: await decryptAuthSecret(secret, provider, {
          ciphertext: row.secretCiphertext,
          iv: row.secretIv,
          version: row.secretVersion,
        }),
        source: 'database',
        secretReadable: true,
      }
    }
    catch {
      credentials[provider] = {
        publicKey: row.publicKey,
        secret: '',
        source: 'database',
        secretReadable: false,
      }
    }
  }))

  const deploymentFrom = env.EMAIL_FROM?.trim() || null
  const from = deploymentFrom ?? settings.emailFrom?.trim() ?? null
  const fromName = env.EMAIL_FROM_NAME?.trim() || settings.emailFromName?.trim() || null
  const enabled = {
    email: settings.emailEnabled,
    github: settings.githubEnabled,
    twitter: settings.twitterEnabled,
    telegram: settings.telegramEnabled,
    turnstile: settings.turnstileEnabled,
  }
  const binding = Boolean(env.EMAIL)

  return {
    registrationMode: settings.registrationMode,
    enabled,
    credentials,
    email: {
      binding,
      from,
      fromName,
      senderManagedByDeployment: Boolean(deploymentFrom),
      verificationReady: binding && Boolean(from),
    },
  }
}

export function publicAuthConfig(config: AuthRuntimeConfig): PublicAuthConfig {
  const methods = {
    email: config.enabled.email,
    github: config.enabled.github && credentialReady(config, 'github'),
    twitter: config.enabled.twitter && credentialReady(config, 'twitter'),
    telegram: config.enabled.telegram && credentialReady(config, 'telegram'),
  }
  const turnstileReady = config.enabled.turnstile && credentialReady(config, 'turnstile')
  const emailSignupEnabled = methods.email
    && (config.registrationMode === 'open' || config.email.verificationReady)
  return {
    registrationMode: config.registrationMode,
    signupEnabled: config.registrationMode === 'open' && (emailSignupEnabled || methods.github || methods.twitter || methods.telegram),
    emailSignupEnabled,
    passwordResetEnabled: methods.email && config.email.verificationReady,
    methods,
    turnstile: {
      enabled: turnstileReady,
      siteKey: turnstileReady ? config.credentials.turnstile!.publicKey : null,
    },
  }
}

export function emailVerificationRequired(config: AuthRuntimeConfig): boolean {
  return config.registrationMode === 'invite_only' && config.email.verificationReady
}

export function credentialReady(config: AuthRuntimeConfig, provider: AuthCredentialProvider): boolean {
  const credential = config.credentials[provider]
  return Boolean(credential?.publicKey && credential.secret && credential.secretReadable)
}

export function authSettingsAdminDto(config: AuthRuntimeConfig): AuthSettingsAdminDTO {
  const publicConfig = publicAuthConfig(config)
  const providerDto = (provider: AuthCredentialProvider) => {
    const credential = config.credentials[provider]
    return {
      provider,
      enabled: config.enabled[provider],
      configured: Boolean(credential),
      effective: config.enabled[provider] && credentialReady(config, provider),
      source: credential?.source ?? 'missing',
      publicKey: credential?.publicKey ?? null,
      secretReadable: credential?.secretReadable ?? true,
    } as const
  }
  return {
    ...publicConfig,
    email: {
      enabled: config.enabled.email,
      binding: config.email.binding,
      sender: config.email.from,
      senderName: config.email.fromName,
      verificationReady: config.email.verificationReady,
      senderManagedByDeployment: config.email.senderManagedByDeployment,
    },
    providers: {
      github: providerDto('github'),
      twitter: providerDto('twitter'),
      telegram: providerDto('telegram'),
      turnstile: providerDto('turnstile'),
    },
  }
}
