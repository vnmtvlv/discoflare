/// <reference types="@cloudflare/workers-types" />
import type { Sandbox } from '@cloudflare/sandbox'

export type AgentTaskWorkflowParams = {
  taskId: string
  runId: string
}

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
  NOTIFICATION_DO: DurableObjectNamespace
  AGENT_DO: DurableObjectNamespace
  AGENT_THINK: DurableObjectNamespace
  AGENT_SANDBOX: DurableObjectNamespace<Sandbox>
  AGENT_TASK_WORKFLOW: Workflow<AgentTaskWorkflowParams>
  AI: Ai
  EMAIL?: SendEmail
  MAIL_EMAIL?: SendEmail
  ASSETS?: { fetch: (request: Request) => Promise<Response> }
  REALTIMEKIT_ACCOUNT_ID?: string
  REALTIMEKIT_APP_ID?: string
  REALTIMEKIT_API_KEY?: string
  REALTIMEKIT_API_SECRET?: string
  REALTIMEKIT_PRESET_VOICE?: string
  REALTIMEKIT_PRESET_AV?: string
  AUTH_SECRET?: string
  PUBLIC_ORIGIN?: string
  TWITTER_CLIENT_ID?: string
  TWITTER_CLIENT_SECRET?: string
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
  ADMIN_PASSWORD?: string
  ADMIN_NAME?: string
  ADMIN_HANDLE?: string
  ADMIN_WORKSPACE?: string
  AGENT_MODEL?: string
}
