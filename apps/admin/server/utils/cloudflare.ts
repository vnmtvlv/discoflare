import type { H3Event } from 'h3'
import { cloudflareClient } from '@discoflare/installer-core'

export type AdminEnv = {
  ASSETS?: Fetcher
  DISCOFLARE_ADMIN_ACCOUNT_ID?: string
  DISCOFLARE_ADMIN_ACCOUNT_NAME?: string
  DISCOFLARE_ADMIN_EMAIL?: string
  DISCOFLARE_ADMIN_ORIGIN?: string
  DISCOFLARE_ADMIN_VERSION?: string
  DISCOFLARE_ADMIN_WORKER_NAME?: string
  DISCOFLARE_ADMIN_TOKEN?: string
  DISCOFLARE_ADMIN_CREDENTIAL_MODE?: string
  DISCOFLARE_ADMIN_OAUTH_ACCESS_TOKEN?: string
  DISCOFLARE_ADMIN_OAUTH_REFRESH_TOKEN?: string
  DISCOFLARE_ADMIN_OAUTH_CLIENT_ID?: string
  DISCOFLARE_ADMIN_OAUTH_EXPIRES_AT?: string
  CF_ACCESS_ISS?: string
  CF_ACCESS_AUD?: string
}

type CloudflareContext = {
  env?: AdminEnv
  context?: ExecutionContext
  request?: Request
}

export function cloudflare(event: H3Event) {
  const value = event.context.cloudflare as CloudflareContext | undefined
  return {
    env: value?.env || {},
    context: value?.context,
    request: value?.request,
  }
}

export function requireAdminConfig(event: H3Event) {
  const { env } = cloudflare(event)
  const development = import.meta.dev ? useRuntimeConfig(event) : null
  const accountId = env.DISCOFLARE_ADMIN_ACCOUNT_ID?.trim()
    || String(development?.adminAccountId || '').trim()
  const workerName = env.DISCOFLARE_ADMIN_WORKER_NAME?.trim()
    || String(development?.adminWorkerName || '').trim()
    || 'discoflare-admin'
  const origin = env.DISCOFLARE_ADMIN_ORIGIN?.trim()
    || String(development?.adminOrigin || '').trim()
  const email = (env.DISCOFLARE_ADMIN_EMAIL?.trim()
    || String(development?.adminEmail || '').trim()).toLowerCase()
  const accountName = env.DISCOFLARE_ADMIN_ACCOUNT_NAME?.trim()
    || String(development?.adminAccountName || '').trim()
    || 'Cloudflare account'
  if (!/^[0-9a-f]{32}$/u.test(accountId) || !origin || !email) {
    throw createError({ statusCode: 503, statusMessage: 'Discoflare Admin bootstrap is incomplete' })
  }
  return { env, accountId, accountName, workerName, origin, email }
}

type OAuthRefreshResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
}

let activeRefresh: Promise<string> | null = null

async function refreshManagedOAuth(event: H3Event) {
  const { env, accountId, workerName } = requireAdminConfig(event)
  const refreshToken = env.DISCOFLARE_ADMIN_OAUTH_REFRESH_TOKEN?.trim() || ''
  const clientId = env.DISCOFLARE_ADMIN_OAUTH_CLIENT_ID?.trim() || ''
  if (!refreshToken || !clientId) throw createError({ statusCode: 409, statusMessage: 'Reconnect managed Cloudflare access from discoflare.com/deploy' })

  const response = await fetch('https://dash.cloudflare.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId }),
  })
  const payload = await response.json().catch(() => ({})) as OAuthRefreshResponse
  const accessToken = payload.access_token?.trim() || ''
  const nextRefreshToken = payload.refresh_token?.trim() || refreshToken
  if (!response.ok || !accessToken) throw createError({ statusCode: 401, statusMessage: 'Managed Cloudflare access expired. Reconnect from discoflare.com/deploy' })

  const expiresAt = Date.now() + Math.max(60, (payload.expires_in || 3600) - 30) * 1000
  const secrets = cloudflareClient(accessToken).workers.scripts.secrets
  const update = (name: string, text: string) => secrets.update(workerName, {
    account_id: accountId,
    name,
    text,
    type: 'secret_text',
  })
  await update('DISCOFLARE_ADMIN_OAUTH_REFRESH_TOKEN', nextRefreshToken)
  await update('DISCOFLARE_ADMIN_OAUTH_EXPIRES_AT', String(expiresAt))
  await update('DISCOFLARE_ADMIN_OAUTH_ACCESS_TOKEN', accessToken)
  return accessToken
}

export function adminCredentialMode(env: AdminEnv) {
  if (env.DISCOFLARE_ADMIN_TOKEN?.trim()) return 'account-token' as const
  if (env.DISCOFLARE_ADMIN_OAUTH_REFRESH_TOKEN?.trim()) return 'managed-oauth' as const
  return 'none' as const
}

export async function requireAccountToken(event: H3Event) {
  const { env } = requireAdminConfig(event)
  const token = env.DISCOFLARE_ADMIN_TOKEN?.trim() || ''
  if (token) return token
  const accessToken = env.DISCOFLARE_ADMIN_OAUTH_ACCESS_TOKEN?.trim() || ''
  const expiresAt = Number(env.DISCOFLARE_ADMIN_OAUTH_EXPIRES_AT || 0)
  if (accessToken && expiresAt > Date.now() + 60_000) return accessToken
  if (!env.DISCOFLARE_ADMIN_OAUTH_REFRESH_TOKEN?.trim()) {
    throw createError({ statusCode: 409, statusMessage: 'Connect the Cloudflare account first' })
  }
  activeRefresh ||= refreshManagedOAuth(event).finally(() => { activeRefresh = null })
  return activeRefresh
}
