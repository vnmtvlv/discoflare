/// <reference types="@cloudflare/workers-types" />

export type Rpc<T> = { fetch: (request: Request) => Promise<Response> } & T

export function asRpc<T>(stub: unknown): Rpc<T> {
  return stub as Rpc<T>
}

export type DiscoflareEnv = {
  DB: D1Database
  FILES: R2Bucket
  SESSIONS: KVNamespace
  CHANNEL_DO: DurableObjectNamespace
  GUILD_DO: DurableObjectNamespace
  RATE_LIMIT_DO: DurableObjectNamespace
  ASSETS?: { fetch: (request: Request) => Promise<Response> }
  REALTIMEKIT_ACCOUNT_ID?: string
  REALTIMEKIT_APP_ID?: string
  REALTIMEKIT_API_KEY?: string
  REALTIMEKIT_API_SECRET?: string
  REALTIMEKIT_PRESET_VOICE?: string
  REALTIMEKIT_PRESET_AV?: string
  AUTH_SECRET?: string
  ADMIN_EMAIL?: string
  ADMIN_PASSWORD?: string
  ADMIN_NAME?: string
  ADMIN_HANDLE?: string
  ADMIN_WORKSPACE?: string
}

export const SESSION_COOKIE = 'df_session'

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const key = part.slice(0, idx).trim()
    if (key === name) return decodeURIComponent(part.slice(idx + 1).trim())
  }
  return null
}
