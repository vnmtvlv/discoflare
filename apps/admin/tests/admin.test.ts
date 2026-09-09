import { describe, expect, it } from 'vitest'
import { accountAdminTokenTemplateUrl, deriveAdminCapability } from '@discoflare/installer-core'
import { ACCESS_LOGOUT_PATH, GITHUB_RELEASES_URL } from '../app/utils/account-controls'

describe('Discoflare Admin authority', () => {
  it('offers one fixed Cloudflare account-token template', () => {
    const url = new URL(accountAdminTokenTemplateUrl())
    expect(url.origin).toBe('https://dash.cloudflare.com')
    expect(url.searchParams.get('name')).toBe('Discoflare Admin')
  })

  it('derives a different narrow capability for every installation', async () => {
    const accountId = 'a'.repeat(32)
    const first = await deriveAdminCapability('account-admin-token', accountId, 'workspace-one')
    const second = await deriveAdminCapability('account-admin-token', accountId, 'workspace-two')
    expect(first).not.toBe(second)
    expect(first).toHaveLength(43)
  })

  it('keeps account controls on canonical destinations', () => {
    expect(ACCESS_LOGOUT_PATH).toBe('/cdn-cgi/access/logout')
    expect(GITHUB_RELEASES_URL).toBe('https://github.com/vnmtvlv/discoflare/releases')
  })
})
