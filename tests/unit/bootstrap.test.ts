import { describe, expect, it } from 'vitest'
import { readAdminEnv } from '../../server/utils/bootstrap'

describe('readAdminEnv', () => {
  it('returns null when email or password is missing', () => {
    expect(readAdminEnv({})).toBeNull()
    expect(readAdminEnv({ ADMIN_EMAIL: 'admin@discoflare.com' })).toBeNull()
    expect(readAdminEnv({ ADMIN_EMAIL: 'admin@discoflare.com', ADMIN_PASSWORD: 'short' })).toBeNull()
  })
  it('uses name, then handle, then the email local-part', () => {
    expect(readAdminEnv({
      ADMIN_EMAIL: 'admin@discoflare.com',
      ADMIN_PASSWORD: 'password9293',
      ADMIN_NAME: 'Ada',
      ADMIN_HANDLE: 'ada',
    })).toEqual({
      email: 'admin@discoflare.com',
      password: 'password9293',
      displayName: 'Ada',
      guildName: 'HQ',
    })
    expect(readAdminEnv({
      ADMIN_EMAIL: 'admin@discoflare.com',
      ADMIN_PASSWORD: 'password9293',
      ADMIN_HANDLE: 'ada',
    })?.displayName).toBe('ada')
    expect(readAdminEnv({
      ADMIN_EMAIL: 'admin@discoflare.com',
      ADMIN_PASSWORD: 'password9293',
    })?.displayName).toBe('admin')
  })
})
