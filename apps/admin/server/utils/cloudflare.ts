import type { H3Event } from 'h3'

export type AdminEnv = {
  ASSETS?: Fetcher
  DISCOFLARE_ADMIN_ACCOUNT_ID?: string
  DISCOFLARE_ADMIN_ACCOUNT_NAME?: string
  DISCOFLARE_ADMIN_EMAIL?: string
  DISCOFLARE_ADMIN_ORIGIN?: string
  DISCOFLARE_ADMIN_WORKER_NAME?: string
  DISCOFLARE_ADMIN_TOKEN?: string
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

export function requireAccountToken(event: H3Event) {
  const { env } = requireAdminConfig(event)
  const token = env.DISCOFLARE_ADMIN_TOKEN?.trim() || ''
  if (!token) throw createError({ statusCode: 409, statusMessage: 'Connect the Account Admin Token first' })
  return token
}
