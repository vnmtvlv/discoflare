import { describe, expect, it } from 'vitest'
import { HOSTED_USAGE_KEY } from '../../packages/admin-core/src/hosted-plan'
import type { DiscoflareEnv } from '../../workers/env'
import { assertHostedAgentLimit, recordHostedAgentUsage } from '../../workers/hosted-usage'
import { routeHostedRequest } from '../../workers/hosted-dispatch'

const rates = JSON.stringify({
  'test-model': { inputUnitsPerMillion: 1_000_000, outputUnitsPerMillion: 0 },
})

function hostedEnv(hosted = true, units = '1000') {
  const store = new Map<string, string>()
  const env = {
    DISCOFLARE_HOSTED: hosted ? 'true' : undefined,
    DISCOFLARE_AGENT_USAGE_UNITS: units,
    DISCOFLARE_AGENT_MODEL_RATES: rates,
    TICKETS: {
      async get(key: string, type?: string) {
        const value = store.get(key)
        if (value == null) return null
        return type === 'json' ? JSON.parse(value) : value
      },
      async put(key: string, value: string) {
        store.set(key, value)
      },
    },
  } as unknown as DiscoflareEnv
  return { env, store }
}

describe('hosted agent usage gate', () => {
  it('does nothing for a self-hosted workspace', async () => {
    const { env, store } = hostedEnv(false)
    await assertHostedAgentLimit(env)
    await recordHostedAgentUsage(env, 'test-model', { usage: { inputTokens: 10, outputTokens: 10 } })
    expect(store.size).toBe(0)
  })

  it('records configured token units and blocks the next turn when the limit is spent', async () => {
    const { env, store } = hostedEnv()
    const now = new Date('2026-10-13T00:00:00.000Z')
    await assertHostedAgentLimit(env, now)
    await recordHostedAgentUsage(env, 'test-model', { usage: { inputTokens: 400, outputTokens: 0 } }, now)
    expect(JSON.parse(store.get(HOSTED_USAGE_KEY) || '{}')).toMatchObject({ includedUsedUnits: 400, creditUnits: 0 })

    const { env: capped } = hostedEnv(true, '100')
    await recordHostedAgentUsage(capped, 'test-model', { usage: { inputTokens: 250, outputTokens: 0 } }, now)
    await expect(assertHostedAgentLimit(capped, now)).rejects.toThrow('usage limit')
  })

  it('stops further use when a turn cannot be priced', async () => {
    const { env } = hostedEnv(true, '100')
    const now = new Date('2026-10-13T00:00:00.000Z')
    await recordHostedAgentUsage(env, 'unconfigured-model', { usage: { inputTokens: 1, outputTokens: 1 } }, now)
    await expect(assertHostedAgentLimit(env, now)).rejects.toThrow('usage limit')
  })
})

describe('hosted dispatch', () => {
  it('routes a subdomain and pauses a suspended workspace', async () => {
    const routes = new Map<string, string>([['script:acme', 'ws-acme']])
    const fetched: string[] = []
    const env = {
      HOSTED_APEX: 'workspaces.example.com',
      ROUTES: { get: async (key: string) => routes.get(key) ?? null },
      DISPATCHER: {
        get(name: string) {
          return { fetch: async () => { fetched.push(name); return new Response('ok') } }
        },
      },
    }
    const response = await routeHostedRequest(new Request('https://acme.workspaces.example.com/chat'), env)
    expect(response.status).toBe(200)
    expect(fetched).toEqual(['ws-acme'])

    routes.set('status:acme', 'suspended')
    const paused = await routeHostedRequest(new Request('https://acme.workspaces.example.com/chat'), env)
    expect(paused.status).toBe(402)
    expect(fetched).toEqual(['ws-acme'])
  })

  it('does not treat the apex as a workspace', async () => {
    const response = await routeHostedRequest(new Request('https://workspaces.example.com/'), {
      HOSTED_APEX: 'workspaces.example.com',
      DISPATCHER: { get: () => { throw new Error('should not dispatch') } },
    })
    expect(response.status).toBe(404)
  })
})