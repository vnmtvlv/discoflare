import { describe, expect, it } from 'vitest'
import {
  adminLoginTarget,
  CLOUDFLARE_LOGIN_OAUTH_SCOPES,
  CLOUDFLARE_MANAGED_OAUTH_SCOPES,
} from '../server/utils/cloudflare-oauth'

describe('managed OAuth permissions', () => {
  it('can bootstrap Admin and create its account-owned token', () => {
    const scopes = CLOUDFLARE_MANAGED_OAUTH_SCOPES.split(' ')
    expect(scopes).toContain('workers-scripts.write')
    expect(scopes).toContain('account-api-tokens.write')
    expect(scopes).not.toContain('offline_access')
    expect(scopes).not.toContain('access.write')
    expect(scopes).not.toContain('d1.write')
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
