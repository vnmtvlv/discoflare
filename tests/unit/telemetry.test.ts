import { describe, expect, it, vi } from 'vitest'
import { sendTelemetryHeartbeat, telemetryHeartbeat } from '../../server/utils/telemetry'
import type { DiscoflareEnv } from '../../workers/env'

function env(overrides: Partial<DiscoflareEnv> = {}) {
  return {
    DB: {
      prepare: vi.fn(() => ({ first: vi.fn(async () => ({ enabled: 1 })) })),
    },
    FILES: {},
    TICKETS: {},
    AI: {},
    AGENT_DO: {},
    AGENT_TASK_WORKFLOW: {},
    DISCOFLARE_VERSION: '0.2.0',
    DISCOFLARE_TELEMETRY_ID: '019c-test-installation',
    DISCOFLARE_TELEMETRY_TOKEN: 'private-token',
    DISCOFLARE_APP_HOSTNAME: 'chat.example.com',
    ...overrides,
  } as unknown as DiscoflareEnv
}

describe('anonymous telemetry', () => {
  it('contains capability flags but no workspace identity or activity', () => {
    const heartbeat = telemetryHeartbeat(env(), '2026-09-05T12:00:00.000Z')
    expect(heartbeat).toMatchObject({
      schemaVersion: 1,
      installationId: '019c-test-installation',
      version: '0.2.0',
      capabilities: { d1: true, r2: true, kv: true, customDomain: true, email: false, agents: true, huddles: false },
    })
    expect(JSON.stringify(heartbeat)).not.toMatch(/workspace|message|member|domainName|emailAddress/)
  })

  it('does not call the endpoint after opt-out', async () => {
    const fetcher = vi.fn()
    const disabled = env({
      DB: { prepare: vi.fn(() => ({ first: vi.fn(async () => ({ enabled: 0 })) })) } as unknown as D1Database,
    })
    await expect(sendTelemetryHeartbeat(disabled, fetcher)).resolves.toBe('disabled')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('authenticates and sends an enabled heartbeat', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }))
    await expect(sendTelemetryHeartbeat(env(), fetcher)).resolves.toBe('sent')
    expect(fetcher).toHaveBeenCalledWith('https://discoflare.com/api/telemetry/heartbeat', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer private-token' }),
    }))
  })

  it('reports Admin-backed Huddles without a broad workspace token', () => {
    const heartbeat = telemetryHeartbeat(env({
      REALTIMEKIT_ACCOUNT_ID: 'a'.repeat(32),
      REALTIMEKIT_APP_ID: '019c8d30-bf29-7000-8000-000000000001',
      DISCOFLARE_ADMIN: {} as Fetcher,
    }))
    expect(heartbeat?.capabilities.huddles).toBe(true)
  })

  it('does not report Agents when the base Installation explicitly omits Agent Computer', () => {
    const heartbeat = telemetryHeartbeat(env({ DISCOFLARE_AGENT_COMPUTER_ENABLED: 'false' }))
    expect(heartbeat?.capabilities.agents).toBe(false)
  })

  it('does not infer Agent Computer from the Durable Object binding alone', () => {
    const heartbeat = telemetryHeartbeat(env({ AGENT_TASK_WORKFLOW: undefined }))
    expect(heartbeat?.capabilities.agents).toBe(false)
  })
})
