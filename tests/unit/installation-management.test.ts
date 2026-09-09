import { describe, expect, it } from 'vitest'
import { emptyLiveFiles, managedInstallationOrigin, managedUninstallUrl, managedUpdateRequest } from '../../server/utils/installation-management'
import type { DiscoflareEnv } from '../../workers/env'

describe('managed installation links', () => {
  it('uses the installer hostname instead of a request alias', () => {
    const env = { DISCOFLARE_APP_HOSTNAME: 'chat.example.com' } as DiscoflareEnv
    expect(managedInstallationOrigin(env, 'https://preview.example.workers.dev')).toBe('https://chat.example.com')
  })

  it('falls back to the current request origin', () => {
    expect(managedInstallationOrigin({} as DiscoflareEnv, 'https://chat.example.com/path')).toBe('https://chat.example.com')
  })

  it('builds an exact uninstall target', () => {
    expect(managedUninstallUrl('https://chat.example.com', 'secret')).toBe('https://discoflare.com/uninstall?origin=https%3A%2F%2Fchat.example.com#claim=secret')
  })

  it('reconstructs the managed installer request without exposing its token', () => {
    const request = managedUpdateRequest({
      DISCOFLARE_ACCOUNT_ID: 'a'.repeat(32),
      DISCOFLARE_WORKER_NAME: 'discoflare-managed',
      DISCOFLARE_APP_HOSTNAME: 'managed.example.com',
      DISCOFLARE_MANAGEMENT_MODE: 'managed',
      DISCOFLARE_CUSTOM_DOMAIN: 'true',
      DISCOFLARE_ZONE_ID: 'b'.repeat(32),
      DISCOFLARE_ZONE_NAME: 'example.com',
      DISCOFLARE_APP_SUBDOMAIN: 'managed',
      APP_NAME: 'Managed',
      AUTH_MODE: 'builtin',
      AUTH_REGISTRATION_MODE: 'invite_only',
      REALTIMEKIT_ACCOUNT_ID: 'a'.repeat(32),
      REALTIMEKIT_APP_ID: 'realtime-app',
      DISCOFLARE_ADMIN_TOKEN: 'secret',
      DISCOFLARE_ADMIN_TOKEN_ID: 'token-id',
    } as DiscoflareEnv, 'v0.6.0')

    expect(request).toMatchObject({
      managementMode: 'managed',
      customDomainEnabled: true,
      zoneName: 'example.com',
      appSubdomain: 'managed',
      realtimekitEnabled: true,
      targetVersion: 'v0.6.0',
    })
    expect(request.realtimekitApiToken).toBe('')
    expect(request).not.toHaveProperty('adminToken')
  })

  it('deletes every R2 page in bulk', async () => {
    const objects = [
      { objects: [{ key: 'a' }, { key: 'b' }], truncated: true, cursor: 'next' },
      { objects: [{ key: 'c' }], truncated: false },
      { objects: [], truncated: false },
    ]
    const deleted: string[][] = []
    const bucket = {
      list: async () => objects.shift(),
      delete: async (keys: string[]) => { deleted.push(keys) },
    } as unknown as R2Bucket

    await expect(emptyLiveFiles(bucket)).resolves.toBe(3)
    expect(deleted).toEqual([['a', 'b'], ['c']])
  })
})
