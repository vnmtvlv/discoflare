import { describe, expect, it } from 'vitest'
import {
  adminLoginTarget,
  CLOUDFLARE_LOGIN_OAUTH_SCOPES,
  CLOUDFLARE_MANAGED_OAUTH_SCOPES,
} from '../server/utils/cloudflare-oauth'

describe('managed OAuth permissions', () => {
  it('covers the Admin runtime without token creation or Access', () => {
    const scopes = CLOUDFLARE_MANAGED_OAUTH_SCOPES.split(' ')
    expect(scopes).toContain('workers-scripts.write')
    expect(scopes).toContain('d1.write')
    expect(scopes).toContain('realtime.admin')
    expect(scopes).toContain('email-sending.write')
    expect(scopes).not.toContain('account-api-tokens.write')
    // Self-managed OAuth clients issue refresh tokens only when offline_access is requested.
    expect(scopes).toContain('offline_access')
    expect(scopes).not.toContain('access.write')
  })

  it('uses only identity and Admin verification scopes for later sign-ins', () => {
    expect(CLOUDFLARE_LOGIN_OAUTH_SCOPES.split(' ')).toEqual([
      'workers-scripts.read',
      'user-details.read',
      'memberships.read',
    ])
  })

  it('hands login only to the canonical Admin Worker origin', () => {
    const accountId = 'a'.repeat(32)
    expect(adminLoginTarget('https://discoflare-admin.example.workers.dev', accountId)).toEqual({
      origin: 'https://discoflare-admin.example.workers.dev',
      accountId,
    })
    expect(adminLoginTarget('https://evil.example/admin', accountId)).toBeNull()
    expect(adminLoginTarget('https://discoflare-admin.example.workers.dev.evil.test', accountId)).toBeNull()
  })
})
