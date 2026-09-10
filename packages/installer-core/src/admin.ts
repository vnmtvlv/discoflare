import { cloudflareClient } from './cloudflare-client.js'
import { createError } from './errors.js'
import { instanceAdminPermissionTemplate, type InstanceAdminCredential } from './instance-admin.js'

export const discoflareAdminWorkerName = 'discoflare-admin'
export const adminManagedCapability = 'discoflare-admin-v1'

export function accountAdminTokenTemplateUrl() {
  const url = new URL('https://dash.cloudflare.com/')
  url.searchParams.set('to', '/:account/api-tokens')
  url.searchParams.set('permissionGroupKeys', JSON.stringify(instanceAdminPermissionTemplate))
  url.searchParams.set('name', 'Discoflare Admin')
  return url.toString()
}

export async function verifyAccountAdminToken(value: string, accountId: string): Promise<InstanceAdminCredential> {
  const token = value.trim()
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Paste the Account Admin Token' })
  const client = cloudflareClient(token)
  const verification = await client.accounts.tokens.verify({ account_id: accountId })
  if (!verification.id || verification.status !== 'active') {
    throw createError({ statusCode: 403, statusMessage: 'The Account Admin Token is not active for this account' })
  }
  const account = await client.accounts.get({ account_id: accountId })
  if (account.id !== accountId) {
    throw createError({ statusCode: 403, statusMessage: 'The Account Admin Token cannot access this account' })
  }
  return { id: verification.id, value: token }
}

export async function deriveAdminCapability(
  accountAdminToken: string,
  accountId: string,
  workerName: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(accountAdminToken),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`discoflare-admin-v1\n${accountId}\n${workerName}`),
  )
  let binary = ''
  for (const byte of new Uint8Array(signature)) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

export async function verifyAdminCapability(
  key: string,
  candidate: string,
  accountId: string,
  workerName: string,
): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(candidate)) return false
  const encoded = candidate.replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(`${encoded}${'='.repeat((4 - encoded.length % 4) % 4)}`)
  const signature = Uint8Array.from(binary, character => character.charCodeAt(0))
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  return crypto.subtle.verify(
    'HMAC',
    material,
    signature,
    new TextEncoder().encode(`discoflare-admin-v1\n${accountId}\n${workerName}`),
  )
}
