import { cloudflareClient } from './cloudflare-client.js'
import { createError } from './errors.js'

export type InstanceAdminCredential = {
  id: string
  value: string
}

export const instanceAdminCapability = 'managed-instance-admin-v1'

export const instanceAdminPermissionTemplate = [
  { key: 'account_settings', type: 'read' },
  { key: 'd1', type: 'edit' },
  { key: 'workers_scripts', type: 'edit' },
  { key: 'workers_kv_storage', type: 'edit' },
  { key: 'workers_r2', type: 'edit' },
  { key: 'containers', type: 'edit' },
  { key: 'realtime', type: 'admin' },
  { key: 'access', type: 'edit' },
  { key: 'access_acct', type: 'edit' },
  { key: 'zone', type: 'read' },
  { key: 'zone_settings', type: 'edit' },
  { key: 'dns', type: 'edit' },
  { key: 'workers_routes', type: 'edit' },
  { key: 'email_routing_rule', type: 'edit' },
  { key: 'email_sending', type: 'edit' },
] as const

export function instanceAdminTokenTemplateUrl(workerName: string) {
  const url = new URL('https://dash.cloudflare.com/')
  url.searchParams.set('to', '/:account/api-tokens')
  url.searchParams.set('permissionGroupKeys', JSON.stringify(instanceAdminPermissionTemplate))
  url.searchParams.set('name', `Discoflare · ${workerName}`)
  return url.toString()
}

export async function verifyInstanceAdminCredential(
  value: string,
  accountId: string,
): Promise<InstanceAdminCredential> {
  const token = value.trim()
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Paste the instance admin token for managed mode' })
  const client = cloudflareClient(token)
  const verification = await client.accounts.tokens.verify({ account_id: accountId })
  if (!verification.id || verification.status !== 'active') {
    throw createError({ statusCode: 403, statusMessage: 'The instance admin token is not active for this account' })
  }
  const account = await client.accounts.get({ account_id: accountId })
  if (account.id !== accountId) {
    throw createError({ statusCode: 403, statusMessage: 'The instance admin token cannot access this account' })
  }
  return { id: verification.id, value: token }
}
