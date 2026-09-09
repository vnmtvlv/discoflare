import { cloudflareClient, verifyAccountAdminToken } from '@discoflare/installer-core'
import { requireAdminConfig } from '../utils/cloudflare'
import { assertAdminMutation, requireAdminIdentity } from '../utils/security'

export default defineEventHandler(async (event): Promise<{ connected: true }> => {
  assertAdminMutation(event)
  await requireAdminIdentity(event)
  const { token } = await readBody<{ token?: unknown }>(event)
  const value = typeof token === 'string' ? token.trim() : ''
  if (value.length > 4_000) throw createError({ statusCode: 400, statusMessage: 'Account Admin Token is invalid' })
  const { accountId, workerName } = requireAdminConfig(event)
  await verifyAccountAdminToken(value, accountId)
  await cloudflareClient(value).workers.scripts.secrets.update(workerName, {
    account_id: accountId,
    name: 'DISCOFLARE_ADMIN_TOKEN',
    text: value,
    type: 'secret_text',
  })
  const secrets = cloudflareClient(value).workers.scripts.secrets
  for (const name of [
    'DISCOFLARE_ADMIN_OAUTH_REFRESH_TOKEN',
    'DISCOFLARE_ADMIN_OAUTH_EXPIRES_AT',
    'DISCOFLARE_ADMIN_OAUTH_ACCESS_TOKEN',
    'DISCOFLARE_ADMIN_OAUTH_CLIENT_ID',
  ]) {
    await secrets.delete(name, { account_id: accountId, script_name: workerName }).catch(() => undefined)
  }
  return { connected: true }
})
