import { describe, expect, it, vi } from 'vitest'
import { verifyWorkspaceDeployment } from '../app/utils/deployment-health'

describe('Admin browser deployment verification', () => {
  it('retries transient routing failures and accepts a healthy unclaimed workspace', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json({
        version: '0.7.6',
        authMode: 'builtin',
        ok: true,
        ready: false,
        users: 0,
        migrated: true,
        ownerSetup: true,
        realtimekit: true,
      }))

    await expect(verifyWorkspaceDeployment({
      url: 'https://workspace.example.com',
      version: '0.7.6',
      realtimekitEnabled: true,
    }, {
      fetch: fetcher,
      wait: async () => {},
      attempts: 3,
    })).resolves.toBeUndefined()

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher).toHaveBeenLastCalledWith(
      'https://workspace.example.com/api/setup/health',
      expect.objectContaining({ credentials: 'omit', cache: 'no-store' }),
    )
  })

  it('rejects a response from the wrong release', async () => {
    await expect(verifyWorkspaceDeployment({
      url: 'https://workspace.example.com',
      version: '0.7.6',
      realtimekitEnabled: true,
    }, {
      fetch: async () => Response.json({
        version: '0.7.5',
        authMode: 'builtin',
        ok: true,
        ready: true,
        users: 1,
        migrated: true,
        ownerSetup: false,
        realtimekit: true,
      }),
      wait: async () => {},
      attempts: 2,
    })).rejects.toThrow('health verification did not complete')
  })
})
