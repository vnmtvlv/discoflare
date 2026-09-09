import { describe, expect, it } from 'vitest'
import { adminCredentialMode } from '../server/utils/cloudflare'

describe('managed Cloudflare credential', () => {
  it('prefers a private account token when both credential types exist', () => {
    expect(adminCredentialMode({
      DISCOFLARE_ADMIN_TOKEN: 'account-token',
      DISCOFLARE_ADMIN_OAUTH_REFRESH_TOKEN: 'refresh-token',
    })).toBe('account-token')
  })

  it('recognizes a managed OAuth refresh token without central runtime state', () => {
    expect(adminCredentialMode({ DISCOFLARE_ADMIN_OAUTH_REFRESH_TOKEN: 'refresh-token' })).toBe('managed-oauth')
    expect(adminCredentialMode({})).toBe('none')
  })
})
