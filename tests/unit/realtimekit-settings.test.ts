import { describe, expect, it, vi } from 'vitest'
import { encryptSecret } from '../../shared/encrypted-secret'
import type { DiscoflareEnv } from '../../workers/env'
import {
  loadRealtimeKitConfig,
  REALTIMEKIT_SECRET_SCOPE,
  realtimekitConfigured,
  realtimekitSettingsAdminDto,
  testRealtimeKitConnection,
  type RealtimeKitRuntimeConfig,
} from '../../workers/realtimekit'

function envWithRow(row: Record<string, unknown> | null, extra: Partial<DiscoflareEnv> = {}): DiscoflareEnv {
  return {
    DB: {
      prepare: () => ({ first: async () => row }),
    },
    ...extra,
  } as unknown as DiscoflareEnv
}

describe('RealtimeKit settings', () => {
  it('prefers complete deployment credentials without reading D1', async () => {
    const env = {
      DB: { prepare: () => { throw new Error('D1 should not be read') } },
      REALTIMEKIT_ACCOUNT_ID: 'account',
      REALTIMEKIT_APP_ID: 'app',
      REALTIMEKIT_API_KEY: 'token',
      REALTIMEKIT_PRESET_VOICE: 'audio-room',
      REALTIMEKIT_PRESET_AV: 'group-call',
    } as unknown as DiscoflareEnv

    const config = await loadRealtimeKitConfig(env)

    expect(config).toMatchObject({
      accountId: 'account',
      appId: 'app',
      apiKey: 'token',
      source: 'deployment',
      voicePreset: 'audio-room',
      avPreset: 'group-call',
    })
    expect(realtimekitConfigured(config)).toBe(true)
  })

  it('decrypts owner-managed credentials from D1', async () => {
    const installationSecret = 'a sufficiently long installation secret'
    const encrypted = await encryptSecret(installationSecret, REALTIMEKIT_SECRET_SCOPE, 'cloudflare-token')
    const config = await loadRealtimeKitConfig(envWithRow({
      account_id: 'account',
      app_id: 'app',
      api_token_ciphertext: encrypted.ciphertext,
      api_token_iv: encrypted.iv,
      api_token_version: encrypted.version,
      voice_preset: 'voice',
      av_preset: 'group_call_host',
    }, { AUTH_SECRET: installationSecret }))

    expect(config.apiKey).toBe('cloudflare-token')
    expect(config.source).toBe('database')
    expect(config.secretReadable).toBe(true)
    expect(realtimekitConfigured(config)).toBe(true)
    expect(realtimekitSettingsAdminDto(config)).not.toHaveProperty('apiKey')
  })

  it('reports an unreadable saved token after AUTH_SECRET changes', async () => {
    const encrypted = await encryptSecret('original installation secret', REALTIMEKIT_SECRET_SCOPE, 'cloudflare-token')
    const config = await loadRealtimeKitConfig(envWithRow({
      account_id: 'account',
      app_id: 'app',
      api_token_ciphertext: encrypted.ciphertext,
      api_token_iv: encrypted.iv,
      api_token_version: encrypted.version,
      voice_preset: 'voice',
      av_preset: 'group_call_host',
    }, { AUTH_SECRET: 'rotated installation secret' }))

    expect(config.source).toBe('database')
    expect(config.apiTokenConfigured).toBe(true)
    expect(config.secretReadable).toBe(false)
    expect(realtimekitConfigured(config)).toBe(false)
  })

  it('stays optional before the settings migration exists', async () => {
    const env = {
      DB: { prepare: () => ({ first: async () => { throw new Error('no such table') } }) },
    } as unknown as DiscoflareEnv

    await expect(loadRealtimeKitConfig(env)).resolves.toMatchObject({
      source: 'missing',
      apiTokenConfigured: false,
      voicePreset: 'voice',
      avPreset: 'group_call_host',
    })
  })

  it('tests the token, app, and configured presets without creating a meeting', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: [{ name: 'voice' }, { name: 'group_call_host' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const config = {
      accountId: 'account',
      appId: 'app',
      apiKey: 'token',
      apiSecret: '',
      voicePreset: 'voice',
      avPreset: 'group_call_host',
      source: 'database',
      apiTokenConfigured: true,
      secretReadable: true,
    } satisfies RealtimeKitRuntimeConfig

    try {
      await expect(testRealtimeKitConnection(config)).resolves.toEqual({
        presets: ['voice', 'group_call_host'],
      })
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/accounts/account/realtime/kit/app/presets',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ Authorization: 'Bearer token' }),
        }),
      )
    }
    finally {
      fetchMock.mockRestore()
    }
  })

  it('reports configured presets that do not exist', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: [{ name: 'voice' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const config = {
      accountId: 'account',
      appId: 'app',
      apiKey: 'token',
      apiSecret: '',
      voicePreset: 'voice',
      avPreset: 'missing-video',
      source: 'database',
      apiTokenConfigured: true,
      secretReadable: true,
    } satisfies RealtimeKitRuntimeConfig

    try {
      await expect(testRealtimeKitConnection(config)).rejects.toThrow('RealtimeKit preset not found: missing-video')
    }
    finally {
      fetchMock.mockRestore()
    }
  })
})
