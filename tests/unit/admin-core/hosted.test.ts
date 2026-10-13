import { describe, expect, it } from 'vitest'
import {
  HOSTED_INCLUDED_ALLOWANCE_MICROS,
  HOSTED_USAGE_KEY,
  addHostedAgentCredit,
  consumeHostedUsage,
  freshHostedUsageLedger,
  hostedSlugFromHostname,
  hostedUsageAvailable,
  microsForChatResult,
  microsForTokens,
  parseHostedProvisionRequest,
  hostedApi,
  provisionHostedWorkspace,
  rollHostedUsagePeriod,
  type HostedApi,
  type InstallerReleaseManifest,
} from '../../../packages/admin-core/src/index'

const accountId = 'a'.repeat(32)
const routingKvId = 'b'.repeat(32)

function request() {
  return parseHostedProvisionRequest({
    accountId,
    slug: 'Acme',
    apex: 'hosted.example.com.',
    appName: 'Acme',
    ownerEmail: 'OWNER@example.com',
    routingKvId,
  })
}

function release(): { manifest: InstallerReleaseManifest, worker: ArrayBuffer, assets: { assets: [], migrations: Array<{ name: string, sql: string }> } } {
  return {
    manifest: {
      schemaVersion: 1,
      version: '0.2.4',
      releasedAt: '2026-10-13T00:00:00.000Z',
      compatibilityDate: '2026-09-28',
      compatibilityFlags: ['nodejs_compat'],
      capabilities: ['hosted-workspace-v1'],
      worker: { url: './worker.mjs', sha256: 'abc', size: 1 },
      assets: { url: './assets.json', sha256: 'abc', size: 1 },
      durableObjects: [{ binding: 'CHANNEL_DO', className: 'ChannelDurableObject', migration: 'v1' }],
    },
    worker: new TextEncoder().encode('worker').buffer,
    assets: { assets: [], migrations: [{ name: '0001_test', sql: 'SELECT 1;' }] },
  }
}

function cloudflare(options: { existing?: boolean } = {}) {
  const calls: string[] = []
  const kv = new Map<string, string>()
  let uploaded: { bindings?: Array<{ name?: string, type?: string }> } | null = null
  const api: HostedApi = async (path, init) => {
    const method = init?.method || 'GET'
    calls.push(`${method} ${path}`)
    if (path.endsWith('/settings')) {
      if (!options.existing) {
        const missing = new Error('Not found') as Error & { statusCode: number }
        missing.statusCode = 404
        throw missing
      }
      return {
        bindings: [
          { name: 'PUBLIC_ORIGIN', text: 'https://acme.hosted.example.com' },
          { name: 'DISCOFLARE_VERSION', text: '0.2.3' },
          { name: 'DB', database_id: 'db-existing' },
          { name: 'FILES', bucket_name: 'ws-acme-files' },
          { name: 'TICKETS', namespace_id: 'kv-existing' },
        ],
      }
    }
    if (path.includes('/d1/database?')) return []
    if (method === 'POST' && path.endsWith('/d1/database')) return { uuid: 'db-new' }
    if (path.includes('/r2/buckets?')) return { buckets: [] }
    if (method === 'POST' && path.endsWith('/r2/buckets')) return {}
    if (method === 'GET' && path.endsWith('/storage/kv/namespaces')) return []
    if (method === 'POST' && path.endsWith('/storage/kv/namespaces')) return { id: 'c'.repeat(32) }
    if (path.endsWith('/query')) {
      if (String(init?.body).includes('SELECT name FROM d1_migrations')) return [{ results: [] }]
      return [{ success: true }]
    }
    if (path.endsWith('/assets-upload-session')) return { jwt: 'asset-jwt', buckets: [] }
    if (method === 'PUT' && path.includes('/scripts/ws-acme') && !path.includes('/values/')) {
      uploaded = JSON.parse(String((init?.body as FormData).get('metadata')))
      return {}
    }
    if (path.includes('/values/')) {
      const key = decodeURIComponent(path.split('/values/')[1] || '')
      if (method === 'PUT') {
        kv.set(key, String(init?.body))
        return null
      }
      const value = kv.get(key)
      if (value == null) {
        const missing = new Error('Not found') as Error & { statusCode: number }
        missing.statusCode = 404
        throw missing
      }
      return value
    }
    throw new Error(`unexpected ${method} ${path}`)
  }
  return { api, calls, kv, uploaded: () => uploaded }
}

describe('hosted workspace provisioning', () => {
  it('normalizes a paid workspace address onto the hosted apex', () => {
    expect(request()).toMatchObject({
      slug: 'acme',
      apex: 'hosted.example.com',
      ownerEmail: 'owner@example.com',
      dispatchNamespace: 'discoflare-hosted',
      includedAllowanceMicros: HOSTED_INCLUDED_ALLOWANCE_MICROS,
    })
    expect(hostedSlugFromHostname('acme.hosted.example.com', 'hosted.example.com')).toBe('acme')
    expect(hostedSlugFromHostname('hosted.example.com', 'hosted.example.com')).toBeNull()
  })

  it('refuses reserved and malformed addresses', () => {
    expect(() => parseHostedProvisionRequest({ ...request(), slug: 'admin' })).toThrow('lowercase letters')
    expect(() => parseHostedProvisionRequest({ ...request(), slug: '-acme' })).toThrow('lowercase letters')
  })

  it('provisions an isolated workspace with files, an allowance, and no browser or admin binding', async () => {
    const cf = cloudflare()
    const result = await provisionHostedWorkspace(cf.api, request(), release(), new Date('2026-10-13T12:00:00.000Z'))
    expect(result).toMatchObject({
      created: true,
      url: 'https://acme.hosted.example.com',
      scriptName: 'ws-acme',
      databaseId: 'db-new',
      bucketName: 'ws-acme-files',
      appliedMigrations: ['0001_test'],
    })
    expect(result.setupUrl).toContain('/setup#claim=')
    const names = cf.uploaded()?.bindings?.map(binding => binding.name)
    expect(names).toEqual(expect.arrayContaining(['DB', 'FILES', 'TICKETS', 'AI', 'DISCOFLARE_HOSTED']))
    expect(names).not.toContain('BROWSER')
    expect(names).not.toContain('DISCOFLARE_ADMIN')
    expect(names).not.toContain('MAIL_EMAIL')
    const ledger = JSON.parse(cf.kv.get(HOSTED_USAGE_KEY) || '{}')
    expect(ledger).toMatchObject({ period: '2026-10', includedMicros: HOSTED_INCLUDED_ALLOWANCE_MICROS, creditMicros: 0 })
    expect(cf.kv.get('status:acme')).toBe('active')
    expect(cf.kv.get('script:acme')).toBe('ws-acme')
  })

  it('returns an existing workspace without rotating secrets', async () => {
    const cf = cloudflare({ existing: true })
    const result = await provisionHostedWorkspace(cf.api, request(), release())
    expect(result).toMatchObject({ created: false, databaseId: 'db-existing', version: '0.2.3' })
    expect(result.setupUrl).toBeUndefined()
    expect(cf.calls).toEqual([
      `GET /accounts/${accountId}/workers/dispatch/namespaces/discoflare-hosted/scripts/ws-acme/settings`,
    ])
  })

  it('sends the asset session token, not the account token, when uploading files', async () => {
    const seen: string[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get('Authorization') || '')
      return new Response(JSON.stringify({ success: true, result: { jwt: 'done' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch
    try {
      const api = hostedApi('account-token')
      await api('/accounts/x/workers/assets/upload?base64=true', {
        method: 'POST',
        headers: { Authorization: 'Bearer session-jwt' },
        body: new FormData(),
      })
    }
    finally {
      globalThis.fetch = realFetch
    }
    expect(seen).toEqual(['Bearer session-jwt'])
  })

  it('refuses a release that does not know how to enforce the allowance', async () => {
    const built = release()
    built.manifest.capabilities = []
    await expect(provisionHostedWorkspace(cloudflare().api, request(), built)).rejects.toThrow('cannot run as a hosted workspace')
  })

  it('adds usage-pack credit on the tenant ledger', async () => {
    const cf = cloudflare()
    cf.kv.set(HOSTED_USAGE_KEY, JSON.stringify(freshHostedUsageLedger(100, new Date('2026-10-01T00:00:00.000Z'))))
    const ledger = await addHostedAgentCredit(cf.api, accountId, 'c'.repeat(32), 250_000, new Date('2026-10-13T00:00:00.000Z'))
    expect(ledger.creditMicros).toBe(250_000)
  })
})

describe('hosted agent allowance', () => {
  it('prices the default model and resets monthly inclusion without dropping credit', () => {
    const now = new Date('2026-10-13T00:00:00.000Z')
    const ledger = rollHostedUsagePeriod({
      period: '2026-09',
      includedMicros: 5_000_000,
      includedUsedMicros: 4_000_000,
      creditMicros: 10,
    }, now)
    expect(ledger).toMatchObject({ period: '2026-10', includedUsedMicros: 0, creditMicros: 10 })
    expect(microsForTokens('@cf/moonshotai/kimi-k2.7-code', 1_000_000, 1_000_000)).toBe(4_950_000)
    expect(microsForChatResult('@cf/moonshotai/kimi-k2.7-code', { usage: { inputTokens: 0, outputTokens: 0 } })).toBe(0)
    expect(microsForChatResult('@cf/moonshotai/kimi-k2.7-code', {})).toBe(200_000)
    const spent = consumeHostedUsage({ ...ledger, includedUsedMicros: 5_000_000 }, 30)
    expect(spent.creditMicros).toBe(-20)
    expect(hostedUsageAvailable(spent)).toBe(-20)
  })
})
