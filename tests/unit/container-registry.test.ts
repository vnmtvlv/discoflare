import { describe, expect, it, vi } from 'vitest'
import { ensureTenantContainerImage, InstallerError } from '../../packages/installer-core/src/index'

const accountId = 'a'.repeat(32)
const sourceImage = 'ghcr.io/vnmtvlv/discoflare-computer:0.3.2'
const targetImage = `registry.cloudflare.com/${accountId}/discoflare-computer:0.3.2`
const configDigest = `sha256:${'b'.repeat(64)}`
const layerDigest = `sha256:${'c'.repeat(64)}`

function credentials() {
  return new Response(JSON.stringify({
    success: true,
    result: { username: 'tenant', password: 'registry-secret' },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

describe('tenant Container Registry', () => {
  it('reuses an image already mirrored into the tenant account', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(credentials())
      .mockResolvedValueOnce(new Response(null, { status: 200 }))

    await expect(ensureTenantContainerImage(
      'cloudflare-token',
      accountId,
      sourceImage,
      '0.3.2',
      fetcher,
    )).resolves.toBe(targetImage)

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(String(fetcher.mock.calls[1]![0])).toContain(`/v2/${accountId}/discoflare-computer/manifests/0.3.2`)
  })

  it('streams missing GHCR blobs and publishes the release manifest', async () => {
    const manifest = JSON.stringify({
      schemaVersion: 2,
      config: { digest: configDigest },
      layers: [{ digest: layerDigest }],
    })
    const calls: Array<{ url: string, method: string, authorization: string | null }> = []
    const fetcher = vi.fn<typeof fetch>(async (input, init = {}) => {
      const url = String(input)
      const method = init.method || 'GET'
      const headers = new Headers(init.headers)
      calls.push({ url, method, authorization: headers.get('authorization') })

      if (url.includes('/containers/registries/registry.cloudflare.com/credentials')) return credentials()
      if (url.endsWith('/manifests/0.3.2') && method === 'HEAD') return new Response(null, { status: 404 })
      if (url.startsWith('https://ghcr.io/token')) {
        return new Response(JSON.stringify({ token: 'ghcr-token' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.endsWith('/manifests/0.3.2') && method === 'GET') {
        return new Response(manifest, { status: 200, headers: { 'Content-Type': 'application/vnd.oci.image.manifest.v1+json' } })
      }
      if (url.endsWith(`/blobs/${configDigest}`) && method === 'HEAD') return new Response(null, { status: 404 })
      if (url.endsWith(`/blobs/${configDigest}`) && method === 'GET') return new Response('config', { status: 200 })
      if (url.endsWith('/blobs/uploads/') && method === 'POST') {
        return new Response(null, { status: 202, headers: { Location: `/v2/${accountId}/discoflare-computer/blobs/uploads/upload-1` } })
      }
      if (url.includes('/blobs/uploads/upload-1?') && method === 'PUT') return new Response(null, { status: 201 })
      if (url.endsWith(`/blobs/${layerDigest}`) && method === 'HEAD') return new Response(null, { status: 200 })
      if (url.endsWith('/manifests/0.3.2') && method === 'PUT') return new Response(null, { status: 201 })
      throw new Error(`Unexpected registry request: ${method} ${url}`)
    })

    await expect(ensureTenantContainerImage(
      'cloudflare-token',
      accountId,
      sourceImage,
      '0.3.2',
      fetcher,
    )).resolves.toBe(targetImage)

    expect(calls.some(call => call.url.endsWith(`/blobs/${configDigest}`) && call.method === 'GET' && call.authorization === 'Bearer ghcr-token')).toBe(true)
    expect(calls.some(call => call.url.includes('/blobs/uploads/upload-1?digest=') && call.method === 'PUT' && call.authorization?.startsWith('Basic '))).toBe(true)
    expect(calls.some(call => call.url.endsWith('/manifests/0.3.2') && call.method === 'PUT')).toBe(true)
  })

  it('rejects a source image whose tag does not match the release', async () => {
    const fetcher = vi.fn<typeof fetch>()
    await expect(ensureTenantContainerImage(
      'cloudflare-token',
      accountId,
      'ghcr.io/vnmtvlv/discoflare-computer:latest',
      '0.3.2',
      fetcher,
    )).rejects.toBeInstanceOf(InstallerError)
    expect(fetcher).not.toHaveBeenCalled()
  })
})
