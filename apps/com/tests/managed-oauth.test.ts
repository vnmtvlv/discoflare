import { describe, expect, it } from 'vitest'
import { CLOUDFLARE_MANAGED_OAUTH_SCOPES } from '../server/utils/cloudflare-oauth'

describe('managed OAuth permissions', () => {
  it('covers local Admin runtime capabilities without API-token creation', () => {
    const scopes = CLOUDFLARE_MANAGED_OAUTH_SCOPES.split(' ')
    expect(scopes).toContain('workers-scripts.write')
    expect(scopes).toContain('realtime.admin')
    expect(scopes).toContain('email-sending.write')
    expect(scopes).toContain('email-routing-rule.write')
    expect(scopes).not.toContain('account-api-tokens.write')
  })
})
