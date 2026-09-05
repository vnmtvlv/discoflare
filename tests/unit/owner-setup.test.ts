import { describe, expect, it } from 'vitest'
import { maskedOwnerEmail, ownerSetupTokenMatches, readOwnerSetupEnv } from '../../server/utils/owner-setup'

describe('owner setup', () => {
  it('requires an intended owner and a strong installer claim', () => {
    expect(readOwnerSetupEnv({ ADMIN_EMAIL: 'owner@example.com' })).toBeNull()
    expect(readOwnerSetupEnv({ ADMIN_EMAIL: 'bad', ADMIN_SETUP_TOKEN: 'x'.repeat(32) })).toBeNull()
    expect(readOwnerSetupEnv({
      ADMIN_EMAIL: ' Owner@Example.com ',
      ADMIN_SETUP_TOKEN: 'x'.repeat(32),
      APP_NAME: 'Fox',
    })).toEqual({
      email: 'owner@example.com',
      token: 'x'.repeat(32),
      workspaceName: 'Fox',
    })
  })

  it('compares the complete private claim', () => {
    const token = 'claim-token-'.padEnd(40, 'x')
    expect(ownerSetupTokenMatches(token, token)).toBe(true)
    expect(ownerSetupTokenMatches(token, `${token.slice(0, -1)}y`)).toBe(false)
    expect(ownerSetupTokenMatches(token, token.slice(0, -1))).toBe(false)
  })

  it('does not expose the full owner email in public health', () => {
    expect(maskedOwnerEmail('ij69@pm.me')).toBe('i***@pm.me')
  })
})
