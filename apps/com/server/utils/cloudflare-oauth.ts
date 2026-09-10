import type { H3Event } from 'h3'
import { installerConfig } from './installer-config'

export const CLOUDFLARE_AUTH_URL = 'https://dash.cloudflare.com/oauth2/auth'
export const CLOUDFLARE_TOKEN_URL = 'https://dash.cloudflare.com/oauth2/token'
export const CLOUDFLARE_REVOKE_URL = 'https://dash.cloudflare.com/oauth2/revoke'
export const CLOUDFLARE_OAUTH_SCOPES = [
  'workers-scripts.read',
  'workers-scripts.write',
  'account-settings.read',
  'user-details.read',
  'memberships.read',
].join(' ')

export const CLOUDFLARE_MANAGED_OAUTH_SCOPES = [
  CLOUDFLARE_OAUTH_SCOPES,
  'd1.read',
  'd1.write',
  'containers.read',
  'containers.write',
  'workers-kv-storage.read',
  'workers-kv-storage.write',
  'workers-r2.read',
  'workers-r2.write',
  'realtime.read',
  'realtime.write',
  'realtime.admin',
  'zone.read',
  'zone-settings.read',
  'zone-settings.write',
  'dns.read',
  'dns.write',
  'workers-routes.read',
  'workers-routes.write',
  'email-routing-rule.read',
  'email-routing-rule.write',
  'email-sending.read',
  'email-sending.write',
].join(' ')

export const CLOUDFLARE_LOGIN_OAUTH_SCOPES = [
  'workers-scripts.read',
  'user-details.read',
  'memberships.read',
].join(' ')

export const CLOUDFLARE_UNINSTALL_SCOPES = [
  CLOUDFLARE_OAUTH_SCOPES,
  'd1.read',
  'd1.write',
  'containers.read',
  'containers.write',
  'workers-kv-storage.read',
  'workers-kv-storage.write',
  'workers-r2.read',
  'workers-r2.write',
  'zone.read',
  'zone-settings.read',
  'zone-settings.write',
  'dns.read',
  'dns.write',
  'access.read',
  'access.write',
  'access-acct.read',
  'access-acct.write',
].join(' ')

export function adminLoginTarget(originValue: unknown, accountIdValue: unknown) {
  if (typeof originValue !== 'string' || typeof accountIdValue !== 'string' || !/^[0-9a-f]{32}$/u.test(accountIdValue)) return null
  try {
    const origin = new URL(originValue)
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.port || origin.pathname !== '/' || origin.search || origin.hash) return null
    if (!/^discoflare-admin\.[a-z0-9-]+\.workers\.dev$/u.test(origin.hostname)) return null
    return { origin: origin.origin, accountId: accountIdValue }
  }
  catch {
    return null
  }
}

function requestOrigin(event: H3Event) {
  const forwardedHost = getHeader(event, 'x-forwarded-host')?.split(',')[0]?.trim()
  const forwardedProto = getHeader(event, 'x-forwarded-proto')?.split(',')[0]?.trim()
  const host = forwardedHost || getHeader(event, 'host')?.trim()
  if (!host) return ''
  const protocol = forwardedProto === 'https' || forwardedProto === 'http'
    ? forwardedProto
    : getRequestURL(event).protocol.replace(/:$/, '') || 'http'
  try {
    return new URL(`${protocol}://${host}`).origin
  }
  catch {
    return ''
  }
}

export function installerOrigin(event: H3Event) {
  const configured = installerConfig(event).installerOrigin
  const origin = import.meta.dev ? (requestOrigin(event) || configured) : configured
  try {
    return new URL(origin).origin
  }
  catch {
    throw createError({ statusCode: 503, statusMessage: 'Cloudflare installer origin is invalid' })
  }
}

export function oauthConfig(
  event: H3Event,
  scopes = CLOUDFLARE_OAUTH_SCOPES,
) {
  const config = installerConfig(event)
  const clientId = config.cloudflareOAuthClientId
  if (!clientId) {
    throw createError({ statusCode: 503, statusMessage: 'Cloudflare OAuth is not configured' })
  }
  return {
    clientId,
    scopes,
    redirectUri: `${installerOrigin(event)}/api/cloudflare/oauth/callback`,
  }
}

export function randomBase64Url(bytes = 32) {
  const value = new Uint8Array(bytes)
  crypto.getRandomValues(value)
  return bytesToBase64Url(value)
}

export async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return bytesToBase64Url(new Uint8Array(digest))
}

function bytesToBase64Url(value: Uint8Array) {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}
