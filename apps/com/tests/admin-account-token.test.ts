import { describe, expect, it } from 'vitest'
import { instanceAdminPermissionTemplate, instanceAdminTokenPolicies } from '@discoflare/installer-core'

const accountId = 'a'.repeat(32)

describe('Discoflare Admin account token', () => {
  it('does not request Cloudflare Access permissions', () => {
    expect(instanceAdminPermissionTemplate.map(permission => permission.key)).not.toContain('access')
    expect(instanceAdminPermissionTemplate.map(permission => permission.key)).not.toContain('access_acct')
  })

  it('keeps account and zone permissions on the selected account', () => {
    const policies = instanceAdminTokenPolicies(accountId, [
      ...[
        'Account Settings Read',
        'D1 Write',
        'Workers Scripts Write',
        'Workers KV Storage Write',
        'Workers R2 Storage Write',
        'Containers Write',
        'Realtime Write',
      ].map((name, index) => ({ id: `account-${index}`, name, scopes: ['com.cloudflare.api.account'] })),
      ...[
        'Zone Read',
        'Zone Settings Write',
        'DNS Write',
        'Workers Routes Write',
        'Email Routing Rules Write',
        'Email Sending Write',
      ].map((name, index) => ({ id: `zone-${index}`, name, scopes: ['com.cloudflare.api.account.zone'] })),
    ])
    expect(policies).toHaveLength(2)
    expect(policies[0]?.resources).toEqual({ [`com.cloudflare.api.account.${accountId}`]: '*' })
    expect(policies[1]?.resources).toEqual({
      [`com.cloudflare.api.account.${accountId}`]: { 'com.cloudflare.api.account.zone.*': '*' },
    })
  })
})
