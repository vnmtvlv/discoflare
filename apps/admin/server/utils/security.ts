import type { H3Event } from 'h3'
import { adminSessionIdentity, createAdminSession } from './admin-session'
import { requireAdminConfig } from './cloudflare'

export async function requireAdminIdentity(event: H3Event) {
  const sessionIdentity = await adminSessionIdentity(event)
  if (sessionIdentity) return sessionIdentity

  const { accountId, email, userId } = requireAdminConfig(event)
  const config = useRuntimeConfig(event)
  const developmentEmail = String(config.adminDevEmail || '').trim().toLowerCase()
  if (import.meta.dev && developmentEmail === email) {
    return createAdminSession(event, { userId: userId || `development:${email}`, email, accountId })
  }
  throw createError({ statusCode: 401, statusMessage: 'Cloudflare login is required' })
}

export function assertAdminMutation(event: H3Event) {
  const origin = getHeader(event, 'origin')
  const host = getHeader(event, 'host')
  if (!origin || !host) return
  try {
    if (new URL(origin).host === host) return
  }
  catch {
    // Reject malformed origins below.
  }
  throw createError({ statusCode: 403, statusMessage: 'Cross-origin mutation rejected' })
}
