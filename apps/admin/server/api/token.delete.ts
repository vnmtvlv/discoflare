import { cloudflareClient } from '@discoflare/installer-core'
import { requireAccountToken, requireAdminConfig } from '../utils/cloudflare'
import { assertAdminMutation, requireAdminIdentity } from '../utils/security'

export default defineEventHandler(async (event): Promise<{ connected: false }> => {
  assertAdminMutation(event)
  await requireAdminIdentity(event)
  const token = requireAccountToken(event)
  const { accountId, workerName } = requireAdminConfig(event)
  await cloudflareClient(token).workers.scripts.secrets.delete('DISCOFLARE_ADMIN_TOKEN', {
    account_id: accountId,
    script_name: workerName,
  })
  return { connected: false }
})
