import { describe, expect, it } from 'vitest'
import { accountAdminTokenTemplateUrl, deriveAdminCapability } from '@discoflare/installer-core'
import { ADMIN_LOGOUT_PATH, GITHUB_RELEASES_URL } from '../app/utils/account-controls'
import { isNewerRelease } from '../shared/versions'

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
    expect(ADMIN_LOGOUT_PATH).toBe('/api/auth/logout')
    expect(GITHUB_RELEASES_URL).toBe('https://github.com/vnmtvlv/discoflare/releases')
  })

  it('only offers forward Admin releases', () => {
    expect(isNewerRelease('0.7.6', '0.7.7')).toBe(true)
    expect(isNewerRelease('0.7.6', '0.8.0')).toBe(true)
    expect(isNewerRelease('0.7.6', '0.7.6')).toBe(false)
    expect(isNewerRelease('0.7.6', '0.7.5')).toBe(false)
  })
})
