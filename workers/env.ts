/// <reference types="@cloudflare/workers-types" />

export type Rpc<T> = { fetch: (request: Request) => Promise<Response> } & T

export function asRpc<T>(stub: unknown): Rpc<T> {
  return stub as Rpc<T>
}

export type DiscoflareEnv = {
  DB: D1Database
  FILES: R2Bucket
  TICKETS: KVNamespace
  CHANNEL_DO: DurableObjectNamespace
  WORKSPACE_DO: DurableObjectNamespace
  RATE_LIMIT_DO: DurableObjectNamespace
  ASSETS?: { fetch: (request: Request) => Promise<Response> }
  REALTIMEKIT_ACCOUNT_ID?: string
  REALTIMEKIT_APP_ID?: string
  REALTIMEKIT_API_KEY?: string
  REALTIMEKIT_API_SECRET?: string
  REALTIMEKIT_PRESET_VOICE?: string
  REALTIMEKIT_PRESET_AV?: string
  AUTH_SECRET?: string
  TWITTER_CLIENT_ID?: string
  TWITTER_CLIENT_SECRET?: string
  APP_NAME?: string
  APP_TITLE?: string
  APP_SUBTITLE?: string
  ADMIN_EMAIL?: string
  ADMIN_PASSWORD?: string
  ADMIN_NAME?: string
  ADMIN_HANDLE?: string
  ADMIN_WORKSPACE?: string
}
