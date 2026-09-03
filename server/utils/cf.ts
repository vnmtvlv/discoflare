import type { H3Event } from 'h3'
import type { DiscoflareEnv } from '../../workers/env'

export type Rpc<T> = { fetch: (request: Request) => Promise<Response> } & T

export function asRpc<T>(stub: unknown): Rpc<T> {
  return stub as Rpc<T>
}

export function cf(event: H3Event): { env: DiscoflareEnv; request?: Request; waitUntil: (p: Promise<unknown>) => void } {
  const box = event.context.cloudflare as {
    env?: DiscoflareEnv
    request?: Request
    context?: { waitUntil: (p: Promise<unknown>) => void }
  } | undefined
  const env = box?.env ?? (globalThis as { __env__?: DiscoflareEnv }).__env__
  if (!env?.DB) {
    throw fail(503, 'unbound', 'Cloudflare bindings unavailable')
  }
  const waitUntil = box?.context?.waitUntil?.bind(box.context)
    ?? event.context.waitUntil?.bind(event.context)
    ?? ((p: Promise<unknown>) => { void p })
  return { env, request: box?.request, waitUntil }
}

export function fail(status: number, code: string, message: string): never {
  throw createError({
    statusCode: status,
    statusMessage: message,
    data: { error: { code, message } },
  })
}

export function originOk(event: H3Event): boolean {
  const method = event.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true
  const origin = getHeader(event, 'origin')
  if (!origin) return true
  const host = getHeader(event, 'host')
  if (!host) return false
  try {
    const o = new URL(origin)
    return o.host === host
  }
  catch {
    return false
  }
}
