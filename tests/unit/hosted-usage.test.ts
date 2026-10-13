import { describe, expect, it } from 'vitest'
import { HOSTED_USAGE_KEY } from '../../packages/admin-core/src/hosted-plan'
import type { DiscoflareEnv } from '../../workers/env'
import { assertHostedAgentAllowance, recordHostedAgentUsage } from '../../workers/hosted-usage'
import { routeHostedRequest } from '../../workers/hosted-dispatch'

function hostedEnv(hosted = true, allowance = '5000000') {
  const store = new Map<string, string>()
  const env = {
    DISCOFLARE_HOSTED: hosted ? 'true' : undefined,
    DISCOFLARE_AGENT_ALLOWANCE_MICROS: allowance,
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
    await assertHostedAgentAllowance(env)
    await recordHostedAgentUsage(env, '@cf/moonshotai/kimi-k2.7-code', { usage: { inputTokens: 10, outputTokens: 10 } })
    expect(store.size).toBe(0)
  })

  it('blocks another turn after the allowance is spent and records token cost', async () => {
    const { env, store } = hostedEnv()
    const now = new Date('2026-10-13T00:00:00.000Z')
    await assertHostedAgentAllowance(env, now)
    await recordHostedAgentUsage(env, '@cf/moonshotai/kimi-k2.7-code', {
      usage: { inputTokens: 1_000_000, outputTokens: 0 },
    }, now)
    const ledger = JSON.parse(store.get(HOSTED_USAGE_KEY) || '{}') as { includedUsedMicros: number, creditMicros: number }
    expect(ledger).toMatchObject({ includedUsedMicros: 950_000, creditMicros: 0 })

    const { env: capped, store: cappedStore } = hostedEnv(true, '1000')
    await recordHostedAgentUsage(capped, '@cf/moonshotai/kimi-k2.7-code', {}, now)
    expect(JSON.parse(cappedStore.get(HOSTED_USAGE_KEY) || '{}')).toMatchObject({
      includedUsedMicros: 1000,
      creditMicros: -199_000,
    })
    await expect(assertHostedAgentAllowance(capped, now)).rejects.toThrow('agent allowance')
  })
})

describe('hosted dispatch', () => {
  it('routes a subdomain and pauses a suspended workspace', async () => {
    const routes = new Map<string, string>([['script:acme', 'ws-acme']])
    const fetched: string[] = []
    const env = {
      HOSTED_APEX: 'hosted.example.com',
      ROUTES: { get: async (key: string) => routes.get(key) ?? null },
      DISPATCHER: {
        get(name: string) {
          return { fetch: async () => { fetched.push(name); return new Response('ok') } }
        },
      },
    }
    const response = await routeHostedRequest(new Request('https://acme.hosted.example.com/chat'), env)
    expect(response.status).toBe(200)
    expect(fetched).toEqual(['ws-acme'])

    routes.set('status:acme', 'suspended')
    const paused = await routeHostedRequest(new Request('https://acme.hosted.example.com/chat'), env)
    expect(paused.status).toBe(402)
    expect(fetched).toEqual(['ws-acme'])
  })

  it('does not treat the apex as a workspace', async () => {
    const response = await routeHostedRequest(new Request('https://hosted.example.com/'), {
      HOSTED_APEX: 'hosted.example.com',
      DISPATCHER: { get: () => { throw new Error('should not dispatch') } },
    })
    expect(response.status).toBe(404)
  })
})
