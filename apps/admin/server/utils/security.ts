import type { H3Event } from 'h3'
import { adminSessionIdentity, createAdminSession } from './admin-session'
import { verifyAccessIdentityToken } from './access-identity'
import { cloudflare, requireAdminConfig } from './cloudflare'

export async function requireAdminIdentity(event: H3Event) {
  const sessionIdentity = await adminSessionIdentity(event)
  if (sessionIdentity) return sessionIdentity

  const { accountId, email, env, userId } = requireAdminConfig(event)
  const { context } = cloudflare(event)
  const identity = await context?.access?.getIdentity()
  let actual = identity?.email?.trim().toLowerCase()
  if (!actual) {
    const token = getHeader(event, 'cf-access-jwt-assertion')?.trim() || ''
    const issuer = env.CF_ACCESS_ISS?.trim() || ''
    const audience = env.CF_ACCESS_AUD?.trim() || ''
    if (token && issuer && audience) {
      actual = (await verifyAccessIdentityToken(token, issuer, audience).catch(() => null))?.email
    }
  }
  if (actual === email) return createAdminSession(event, { userId: userId || `legacy:${email}`, email: actual, accountId })

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
