export type ClientMode = 'web' | 'native'

export type ClientServer = {
  origin: string
  name: string
}

export function createLiveFetch(
  current: () => typeof globalThis.fetch = () => globalThis.fetch,
): typeof globalThis.fetch {
  return (input, init) => current()(input, init)
}

export function normalizeServerOrigin(input: string): string {
  const value = input.trim()
  if (!value) throw new Error('Enter a server URL')

  const candidate = /^https?:\/\//iu.test(value) ? value : `https://${value}`
  let url: URL
  try {
    url = new URL(candidate)
  }
  catch {
    throw new Error('Enter a valid server URL')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Server URL must use HTTP or HTTPS')
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
  if (url.protocol !== 'https:' && !local) throw new Error('Discoflare servers must use HTTPS')
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('Enter the server origin without a path')
  }
  return url.origin
}

export function resolveServerUrl(value: string, serverOrigin: string | null): string {
  if (!serverOrigin || !value.startsWith('/') || value.startsWith('//')) return value
  return `${serverOrigin}${value}`
}

export function resolveServerWebSocketUrl(
  path: string,
  serverOrigin: string | null,
  currentOrigin: string,
): string {
  const base = new URL(serverOrigin ?? currentOrigin)
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
  return new URL(path, base).toString()
}
