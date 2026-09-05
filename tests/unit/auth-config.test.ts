import { describe, expect, it } from 'vitest'
import { emailVerificationRequired, publicAuthConfig, type AuthRuntimeConfig } from '../../server/utils/auth-config'

function runtime(overrides: Partial<AuthRuntimeConfig> = {}): AuthRuntimeConfig {
  return {
    registrationMode: 'invite_only',
    enabled: { email: true, github: false, twitter: false, telegram: false, turnstile: false },
    credentials: {},
    email: { binding: false, from: null, fromName: null, senderManagedByDeployment: false, verificationReady: false },
    ...overrides,
  }
}

describe('public auth config', () => {
  it('requires both credentials and the owner switch for social login', () => {
    const config = runtime({
      enabled: { email: true, github: true, twitter: false, telegram: false, turnstile: false },
      credentials: { github: { publicKey: 'id', secret: 'secret', source: 'database', secretReadable: true } },
    })
    expect(publicAuthConfig(config).methods.github).toBe(true)
    config.enabled.github = false
    expect(publicAuthConfig(config).methods.github).toBe(false)
  })

  it('exposes direct email signup for open registration without optional infrastructure', () => {
    const config = runtime({ registrationMode: 'open' })
    expect(publicAuthConfig(config)).toMatchObject({
      signupEnabled: true,
      emailSignupEnabled: true,
      passwordResetEnabled: false,
      turnstile: { enabled: false, siteKey: null },
    })
    expect(emailVerificationRequired(config)).toBe(false)
  })

  it('requires working email delivery for invite-only email signup', () => {
    const config = runtime({
      registrationMode: 'invite_only',
      enabled: { email: true, github: false, twitter: false, telegram: false, turnstile: true },
      credentials: { turnstile: { publicKey: 'site', secret: 'secret', source: 'database', secretReadable: true } },
      email: { binding: true, from: 'login@example.com', fromName: 'Discoflare', senderManagedByDeployment: false, verificationReady: true },
    })
    expect(publicAuthConfig(config)).toMatchObject({ signupEnabled: false, emailSignupEnabled: true })
    expect(emailVerificationRequired(config)).toBe(true)
    expect(publicAuthConfig(config).passwordResetEnabled).toBe(true)
    config.email.binding = false
    config.email.verificationReady = false
    expect(publicAuthConfig(config)).toMatchObject({ signupEnabled: false, emailSignupEnabled: false })
    expect(publicAuthConfig(config).passwordResetEnabled).toBe(false)
    expect(emailVerificationRequired(config)).toBe(false)
  })
})
