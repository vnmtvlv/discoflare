import { describe, expect, it } from 'vitest'
import { installerOAuthError } from '../app/utils/oauth-error'

describe('installer OAuth error copy', () => {
  it('keeps a blank query from looking like a failed login', () => {
    expect(installerOAuthError(undefined)).toBe('')
    expect(installerOAuthError('')).toBe('')
  })

  it('names the failed OAuth step instead of a generic connection error', () => {
    expect(installerOAuthError('oauth_refresh_token')).toContain('refresh token')
    expect(installerOAuthError('invalid_scope')).toContain('permission')
    expect(installerOAuthError('oauth_state')).toContain('expired')
    expect(installerOAuthError('mystery')).toContain('mystery')
  })
})
