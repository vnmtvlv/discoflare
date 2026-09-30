import { describe, expect, it } from 'vitest'
import {
  ADMIN_WORKER_NAME,
  loadAdminRelease,
  updateWorkerBindings,
  workspaceAdminBinding,
  type InstallerReleaseManifest,
} from '../../../packages/admin-core/src/index'

const manifest = {
  version: '0.2.0',
  durableObjects: [{ binding: 'CHANNEL_DO', className: 'ChannelDurableObject', migration: 'v1' }],
} as InstallerReleaseManifest

const legacyBindings = [
  { type: 'plain_text', name: 'DISCOFLARE_VERSION', text: '0.1.9' },
  { type: 'plain_text', name: 'DISCOFLARE_CONTROL_ID', text: 'control' },
  { type: 'plain_text', name: 'DISCOFLARE_CONTROL_ENDPOINT', text: 'https://discoflare.com/api/installation-control' },
  { type: 'secret_text', name: 'DISCOFLARE_CONTROL_TOKEN' },
  { type: 'secret_text', name: 'AUTH_SECRET' },
  { type: 'durable_object_namespace', name: 'CHANNEL_DO', class_name: 'ChannelDurableObject' },
]

describe('workspaces linked to the Discoflare Admin', () => {
  it('binds the workspace to the Admin entrypoint with its own name as trusted props', () => {
    expect(workspaceAdminBinding('team-chat', { service: ADMIN_WORKER_NAME })).toEqual({
      type: 'service',
      name: 'DISCOFLARE_ADMIN',
      service: 'discoflare-admin',
      entrypoint: 'WorkspaceControl',
      props: { workerName: 'team-chat' },
    })
  })

  it('replaces the Installation Control Credential when the Admin updates a workspace', () => {
    const bindings = updateWorkerBindings(legacyBindings, manifest, { service: ADMIN_WORKER_NAME }, 'team-chat')
    const names = bindings.map(binding => binding.name)

    expect(names).not.toContain('DISCOFLARE_CONTROL_ID')
    expect(names).not.toContain('DISCOFLARE_CONTROL_ENDPOINT')
    expect(names).not.toContain('DISCOFLARE_CONTROL_TOKEN')
    expect(bindings).toContainEqual({ type: 'inherit', name: 'AUTH_SECRET' })
    expect(bindings.filter(binding => binding.name === 'DISCOFLARE_ADMIN')).toEqual([
      workspaceAdminBinding('team-chat', { service: ADMIN_WORKER_NAME }),
    ])
  })

  it('leaves legacy workspaces untouched when updated without an Admin', () => {
    const bindings = updateWorkerBindings(legacyBindings, manifest)
    expect(bindings).toContainEqual({ type: 'inherit', name: 'DISCOFLARE_CONTROL_TOKEN' })
    expect(bindings.map(binding => binding.name)).not.toContain('DISCOFLARE_ADMIN')
  })
})

describe('Discoflare Admin releases', () => {
  async function digest(value: Uint8Array) {
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', value))].map(byte => byte.toString(16).padStart(2, '0')).join('')
  }

  async function releaseFetcher(admin: boolean, tamper = false) {
    const worker = new TextEncoder().encode('admin worker')
    const assets = new TextEncoder().encode(JSON.stringify({ assets: [], migrations: [] }))
    const manifestUrl = 'https://example.com/discoflare-cloudflare-manifest.json'
    const asset = async (url: string, body: Uint8Array) => ({ url, sha256: await digest(body), size: body.byteLength })
    const manifest = {
      schemaVersion: 1,
      version: '0.2.0',
      releasedAt: '2026-10-01T00:00:00.000Z',
      compatibilityDate: '2026-09-28',
      compatibilityFlags: ['nodejs_compat'],
      worker: await asset('./discoflare-worker.mjs', worker),
      assets: await asset('./discoflare-assets.json', assets),
      durableObjects: [],
      ...(admin
        ? {
            admin: {
              version: '0.2.0',
              compatibilityDate: '2026-09-28',
              compatibilityFlags: ['nodejs_compat'],
              worker: await asset('./discoflare-admin.mjs', worker),
              assets: await asset('./discoflare-admin-assets.json', assets),
              durableObjects: [{ binding: 'COORDINATOR', className: 'AdminCoordinator', migration: 'v1' }],
            },
          }
        : {}),
    }
    const fetcher = async (input: string | URL | Request) => {
      const url = String(input)
      if (url === manifestUrl) return Response.json(manifest)
      if (url.endsWith('/discoflare-admin.mjs')) return new Response(tamper ? new TextEncoder().encode('changed') : worker)
      if (url.endsWith('/discoflare-admin-assets.json')) return new Response(assets)
      return new Response(null, { status: 404 })
    }
    return { manifestUrl, fetcher: fetcher as typeof fetch }
  }

  it('loads the Admin published in the same release as the workspace', async () => {
    const { manifestUrl, fetcher } = await releaseFetcher(true)
    await expect(loadAdminRelease(manifestUrl, fetcher)).resolves.toMatchObject({
      manifest: { version: '0.2.0', durableObjects: [{ className: 'AdminCoordinator' }] },
      assets: { assets: [] },
    })
  })

  it('refuses releases published before the Admin existed', async () => {
    const { manifestUrl, fetcher } = await releaseFetcher(false)
    await expect(loadAdminRelease(manifestUrl, fetcher)).rejects.toThrow('does not include a Discoflare Admin')
  })

  it('refuses an Admin bundle that does not match its manifest', async () => {
    const { manifestUrl, fetcher } = await releaseFetcher(true, true)
    await expect(loadAdminRelease(manifestUrl, fetcher)).rejects.toThrow('integrity check failed')
  })
})
