import { describe, expect, it } from 'vitest'
import { emptyLiveFiles, managedInstallationOrigin, managedUninstallUrl } from '../../server/utils/installation-management'
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
