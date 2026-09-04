import { describe, expect, it } from 'vitest'
import {
  createLiveFetch,
  normalizeServerOrigin,
  resolveServerUrl,
  resolveServerWebSocketUrl,
} from '../../shared/client-router'

describe('client router', () => {
  it('normalizes a bare server hostname', () => {
    expect(normalizeServerOrigin('sandbox.discoflare.com/')).toBe('https://sandbox.discoflare.com')
  })

  it('rejects a server URL with a path', () => {
    expect(() => normalizeServerOrigin('https://example.com/chat')).toThrow('without a path')
  })

  it('requires HTTPS away from loopback development', () => {
    expect(() => normalizeServerOrigin('http://example.com')).toThrow('must use HTTPS')
    expect(normalizeServerOrigin('http://localhost:3000')).toBe('http://localhost:3000')
  })

  it('routes relative API and media URLs only when a server is selected', () => {
    expect(resolveServerUrl('/api/me', 'https://sandbox.discoflare.com')).toBe('https://sandbox.discoflare.com/api/me')
    expect(resolveServerUrl('/api/me', null)).toBe('/api/me')
    expect(resolveServerUrl('https://cdn.example.com/file', 'https://sandbox.discoflare.com')).toBe('https://cdn.example.com/file')
  })

  it('builds native and web websocket URLs', () => {
    expect(resolveServerWebSocketUrl('/ws/channel/1', 'https://sandbox.discoflare.com', 'capacitor://localhost'))
      .toBe('wss://sandbox.discoflare.com/ws/channel/1')
    expect(resolveServerWebSocketUrl('/ws/channel/1', null, 'http://localhost:3000'))
      .toBe('ws://localhost:3000/ws/channel/1')
  })

  it('uses the current native fetch implementation at request time', async () => {
    const originalFetch = async () => new Response('original')
    const nativeFetch = async () => new Response('native')
    let currentFetch = originalFetch
    const liveFetch = createLiveFetch(() => currentFetch)

    currentFetch = nativeFetch

    expect(await (await liveFetch('https://sandbox.discoflare.com/api/setup/health')).text()).toBe('native')
  })
})
