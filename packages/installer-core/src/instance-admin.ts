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
  { key: 'zone', type: 'read' },
  { key: 'zone_settings', type: 'edit' },
  { key: 'dns', type: 'edit' },
  { key: 'workers_routes', type: 'edit' },
  { key: 'email_routing_rule', type: 'edit' },
  { key: 'email_sending', type: 'edit' },
] as const

type AccountTokenPermissionGroup = {
  id?: string
  name?: string
  scopes?: string[]
}

const instanceAdminPermissionNames = [
  ['Account Settings Read'],
  ['D1 Write', 'D1 Edit'],
  ['Workers Scripts Write', 'Workers Scripts Edit'],
  ['Workers KV Storage Write', 'Workers KV Storage Edit'],
  ['Workers R2 Storage Write', 'Workers R2 Storage Edit'],
  ['Containers Write', 'Containers Edit', 'Cloudchamber Write', 'Cloudchamber Edit'],
  ['Realtime Write', 'Realtime Edit', 'Realtime Admin'],
  ['Zone Read'],
  ['Zone Settings Write', 'Zone Settings Edit'],
  ['DNS Write', 'DNS Edit'],
  ['Workers Routes Write', 'Workers Routes Edit'],
  ['Email Routing Rules Write', 'Email Routing Rules Edit'],
  ['Email Sending Write', 'Email Sending Edit'],
] as const

function permissionName(value: string) {
  return value.trim().toLowerCase().replaceAll(/[^a-z0-9]/gu, '')
}

function statusCode(error: unknown) {
  if (!error || typeof error !== 'object') return 0
  const value = error as { status?: unknown, statusCode?: unknown }
  return Number(value.statusCode || value.status || 0)
}

export function instanceAdminTokenPolicies(accountId: string, groups: AccountTokenPermissionGroup[]) {
  const byName = new Map(groups
    .filter((group): group is AccountTokenPermissionGroup & { id: string, name: string } => Boolean(group.id && group.name))
    .map(group => [permissionName(group.name), group]))
  const selected = instanceAdminPermissionNames.map((aliases) => {
    const group = aliases.map(alias => byName.get(permissionName(alias))).find(Boolean)
    if (!group) throw createError({ statusCode: 502, statusMessage: `Cloudflare does not expose the ${aliases[0]} permission required by Discoflare Admin` })
    return group
  })
  const accountGroups = selected.filter(group => group.scopes?.includes('com.cloudflare.api.account'))
  const zoneGroups = selected.filter(group => group.scopes?.includes('com.cloudflare.api.account.zone'))
  const unscoped = selected.filter(group => !accountGroups.includes(group) && !zoneGroups.includes(group))
  if (unscoped.length) {
    throw createError({ statusCode: 502, statusMessage: `Cloudflare returned an unsupported scope for ${unscoped[0]?.name || 'an Admin permission'}` })
  }
  return [
    ...(accountGroups.length
      ? [{
          effect: 'allow' as const,
          permission_groups: accountGroups.map(group => ({ id: group.id })),
          resources: { [`com.cloudflare.api.account.${accountId}`]: '*' },
        }]
      : []),
    ...(zoneGroups.length
      ? [{
          effect: 'allow' as const,
          permission_groups: zoneGroups.map(group => ({ id: group.id })),
          resources: {
            [`com.cloudflare.api.account.${accountId}`]: {
              'com.cloudflare.api.account.zone.*': '*',
            },
          },
        }]
      : []),
  ]
}

export async function createInstanceAdminCredential(accessToken: string, accountId: string): Promise<InstanceAdminCredential> {
  try {
    const client = cloudflareClient(accessToken)
    const groups: AccountTokenPermissionGroup[] = []
    for await (const group of client.accounts.tokens.permissionGroups.list({ account_id: accountId })) groups.push(group)
    const created = await client.accounts.tokens.create({
      account_id: accountId,
      name: 'Discoflare Admin',
      policies: instanceAdminTokenPolicies(accountId, groups),
    })
    const id = created.id?.trim() || ''
    const value = typeof created.value === 'string' ? created.value.trim() : ''
    if (!id || !value) throw createError({ statusCode: 502, statusMessage: 'Cloudflare did not return the new Discoflare Admin token' })
    return { id, value }
  }
  catch (error) {
    if (statusCode(error) === 403) {
      throw createError({ statusCode: 403, statusMessage: 'Managed Setup requires Super Administrator access to create the Discoflare Admin account token' })
    }
    throw error
  }
}

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
