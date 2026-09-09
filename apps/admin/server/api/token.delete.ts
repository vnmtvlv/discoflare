import { cloudflareClient } from '@discoflare/installer-core'
import { requireAccountToken, requireAdminConfig } from '../utils/cloudflare'
import { assertAdminMutation, requireAdminIdentity } from '../utils/security'

export default defineEventHandler(async (event): Promise<{ connected: false }> => {
  assertAdminMutation(event)
  await requireAdminIdentity(event)
  const token = await requireAccountToken(event)
  const { accountId, workerName } = requireAdminConfig(event)
  const secrets = cloudflareClient(token).workers.scripts.secrets
  for (const name of [
    'DISCOFLARE_ADMIN_TOKEN',
    'DISCOFLARE_ADMIN_OAUTH_REFRESH_TOKEN',
    'DISCOFLARE_ADMIN_OAUTH_EXPIRES_AT',
    'DISCOFLARE_ADMIN_OAUTH_CLIENT_ID',
    'DISCOFLARE_ADMIN_OAUTH_ACCESS_TOKEN',
  ]) {
    await secrets.delete(name, { account_id: accountId, script_name: workerName }).catch(() => undefined)
  }
  return { connected: false }
})
