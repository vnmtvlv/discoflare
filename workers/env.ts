/// <reference types="@cloudflare/workers-types" />

export type Rpc<T> = { fetch: (request: Request) => Promise<Response> } & T

export function asRpc<T>(stub: unknown): Rpc<T> {
  return stub as Rpc<T>
}

export type DiscoflareEnv = {
  DB: D1Database
  FILES?: R2Bucket
  TICKETS: KVNamespace
  CHANNEL_DO: DurableObjectNamespace
  WORKSPACE_DO: DurableObjectNamespace
  RATE_LIMIT_DO: DurableObjectNamespace
  NOTIFICATION_DO: DurableObjectNamespace
  AGENT_DO: DurableObjectNamespace
  AGENT_THINK: DurableObjectNamespace
  AI?: Ai
  /** OpenAI-compatible chat completions base, including `/v1` when the server expects it. */
  AI_BASE_URL?: string
  /** Secret. Sent as a bearer token to `AI_BASE_URL`. */
  AI_API_KEY?: string
  /** Model id for the OpenAI-compatible provider. */
  AI_MODEL?: string
  BROWSER?: {
    quickAction: (action: 'markdown' | 'screenshot' | 'links', options: { url: string }) => Promise<Response>
  }
  /** Chromium DevTools endpoint, `http://127.0.0.1:9222` or a `ws://` browser socket. */
  BROWSER_CDP_URL?: string
  EMAIL?: SendEmail
  MAIL_EMAIL?: SendEmail
  /** Cloudflare service binding, or an http(s) URL for the same JSON send protocol. */
  MAIL_GATEWAY?: Fetcher | string
  MAIL_GATEWAY_URL?: string
  MAIL_GATEWAY_TOKEN?: string
  /** HTTP gateway that relays outbound mail over SMTP. Inbound mail is not provided. */
  SMTP_GATEWAY_URL?: string
  SMTP_GATEWAY_TOKEN?: string
  /**
   * `cloudflare` or `workers` keeps Cloudflare-network features.
   * Any other value, including `celld`, turns them off.
   */
  DISCOFLARE_RUNTIME?: string
  DISCOFLARE_PRIMARY?: string
  DISCOFLARE_MAIL_ROUTES?: string
  DISCOFLARE_EMAIL_DOMAINS?: string
  ASSETS?: { fetch: (request: Request) => Promise<Response> }
  REALTIMEKIT_ACCOUNT_ID?: string
  REALTIMEKIT_APP_ID?: string
  REALTIMEKIT_API_TOKEN?: string
  REALTIMEKIT_PRESET_HOST?: string
  REALTIMEKIT_PRESET_PARTICIPANT?: string
  /** Pre-Live names, still read when the new ones are unset. */
  REALTIMEKIT_API_KEY?: string
  REALTIMEKIT_PRESET_AV?: string
  AUTH_SECRET?: string
  AUTH_MODE?: string
  CF_ACCESS_ISS?: string
  CF_ACCESS_AUD?: string
  PUBLIC_ORIGIN?: string
  TWITTER_CLIENT_ID?: string
  TWITTER_CLIENT_SECRET?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  LINKEDIN_CLIENT_ID?: string
  LINKEDIN_CLIENT_SECRET?: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  TELEGRAM_CLIENT_ID?: string
  TELEGRAM_CLIENT_SECRET?: string
  TURNSTILE_SITE_KEY?: string
  TURNSTILE_SECRET_KEY?: string
  EMAIL_FROM?: string
  EMAIL_FROM_NAME?: string
  MAIL_DOMAIN?: string
  MAIL_ZONE_ID?: string
  MAIL_APP_HOSTNAME?: string
  MAIL_DEFAULT_LOCAL_PART?: string
  AUTH_REGISTRATION_MODE?: string
  VAPID_SUBJECT?: string
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
  APP_NAME?: string
  APP_TITLE?: string
  APP_SUBTITLE?: string
  ADMIN_EMAIL?: string
  ADMIN_SETUP_TOKEN?: string
  ADMIN_PASSWORD?: string
  ADMIN_NAME?: string
  ADMIN_HANDLE?: string
  ADMIN_WORKSPACE?: string
  AGENT_MODEL?: string
  DISCOFLARE_INSTALLATION?: string
  DISCOFLARE_ACCOUNT_ID?: string
  DISCOFLARE_WORKER_NAME?: string
  DISCOFLARE_CUSTOM_DOMAIN?: string
  DISCOFLARE_ZONE_ID?: string
  DISCOFLARE_ZONE_NAME?: string
  DISCOFLARE_APP_SUBDOMAIN?: string
  DISCOFLARE_VERSION?: string
  DISCOFLARE_APP_HOSTNAME?: string
  DISCOFLARE_TELEMETRY_ID?: string
  DISCOFLARE_TELEMETRY_TOKEN?: string
  DISCOFLARE_TELEMETRY_ENDPOINT?: string
  /** Service binding to the account's Discoflare Admin (`WorkspaceControl`). See workers/discoflare-admin.ts. */
  DISCOFLARE_ADMIN?: Fetcher
  /** Legacy Installation Control Credential from discoflare.com, replaced by DISCOFLARE_ADMIN. */
  DISCOFLARE_CONTROL_ID?: string
  DISCOFLARE_CONTROL_TOKEN?: string
  DISCOFLARE_CONTROL_ENDPOINT?: string
}

export type AiProviderName = 'workers-ai' | 'openai-compatible' | null
export type BrowserProviderName = 'workers' | 'cdp' | null

export function aiProvider(env: DiscoflareEnv): AiProviderName {
  if (env.AI) return 'workers-ai'
  if (env.AI_BASE_URL?.trim() && env.AI_API_KEY?.trim() && env.AI_MODEL?.trim()) return 'openai-compatible'
  return null
}

export function agentBrowserConfigured(env: DiscoflareEnv): boolean {
  return browserProvider(env) !== null
}

export function browserProvider(env: DiscoflareEnv): BrowserProviderName {
  if (env.BROWSER) return 'workers'
  if (env.BROWSER_CDP_URL?.trim()) return 'cdp'
  return null
}

export function agentRuntimeConfigured(env: DiscoflareEnv): boolean {
  return Boolean(env.AGENT_DO && aiProvider(env))
}

/** RealtimeKit calls and Email Routing need Cloudflare's network. */
export function cloudflareNetwork(env: DiscoflareEnv): boolean {
  const runtime = env.DISCOFLARE_RUNTIME?.trim().toLowerCase()
  if (runtime === 'cloudflare' || runtime === 'workers') return true
  if (runtime) return false
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (/celld/i.test(ua)) return false
  return true
}

export const DEFAULT_WORKERS_MODEL = '@cf/moonshotai/kimi-k2.7-code'

/** Profile ids that start with `@cf/` are Workers AI ids and are not sent to an OpenAI-compatible endpoint. */
export function resolveAgentModelId(env: DiscoflareEnv, profileModel?: string | null): string {
  const profile = profileModel?.trim() || ''
  if (aiProvider(env) === 'openai-compatible') {
    if (profile && !profile.startsWith('@cf/')) return profile
    return env.AI_MODEL!.trim()
  }
  return profile || env.AGENT_MODEL?.trim() || DEFAULT_WORKERS_MODEL
}
