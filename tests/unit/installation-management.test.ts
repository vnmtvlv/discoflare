import { describe, expect, it } from 'vitest'
import { emptyLiveFiles, installationOrigin, uninstallUrl } from '../../server/utils/installation-management'
import { readManagedInstallationDomains } from '../../server/utils/installation-control'
import type { DiscoflareEnv } from '../../workers/env'

describe('installation links', () => {
  it('uses the installer hostname instead of a request alias', () => {
    const env = { DISCOFLARE_APP_HOSTNAME: 'chat.example.com' } as DiscoflareEnv
    expect(installationOrigin(env, 'https://preview.example.workers.dev')).toBe('https://chat.example.com')
  })

  it('falls back to the current request origin', () => {
    expect(installationOrigin({} as DiscoflareEnv, 'https://chat.example.com/path')).toBe('https://chat.example.com')
  })

  it('builds an exact uninstall target', () => {
    expect(uninstallUrl('https://chat.example.com', 'secret')).toBe('https://discoflare.com/uninstall?origin=https%3A%2F%2Fchat.example.com#claim=secret')
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

  it('reads fixed domain lifecycle state through the Installation Control Credential', async () => {
    const originalFetch = globalThis.fetch
    const requests: Array<{ url: string, authorization: string | null }> = []
    globalThis.fetch = (async (input, init) => {
      requests.push({
        url: String(input),
        authorization: new Headers(init?.headers).get('authorization'),
      })
      return Response.json({
        zones: [{ id: 'zone', name: 'discoflare.com', status: 'active' }],
        appDomain: null,
        emailDomains: [],
      })
    }) as typeof fetch

    try {
      await expect(readManagedInstallationDomains({
        DISCOFLARE_CONTROL_ID: 'installation',
        DISCOFLARE_CONTROL_TOKEN: 't'.repeat(48),
        DISCOFLARE_CONTROL_ENDPOINT: 'https://discoflare.example/api/installation-control',
      } as DiscoflareEnv)).resolves.toMatchObject({ managed: true, appDomain: null })
      expect(requests).toEqual([{
        url: 'https://discoflare.example/api/installation-control/installations/installation/domains',
        authorization: `Bearer ${'t'.repeat(48)}`,
      }])
    }
    finally {
      globalThis.fetch = originalFetch
    }
  })
})
