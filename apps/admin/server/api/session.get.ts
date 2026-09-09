import { accountAdminTokenTemplateUrl, cloudflareClient } from '@discoflare/installer-core'
import type { AdminSession } from '../../shared/types'
import { requireAdminConfig } from '../utils/cloudflare'
import { latestWorkspaceVersion } from '../utils/releases'
import { requireAdminIdentity } from '../utils/security'

export default defineEventHandler(async (event): Promise<AdminSession> => {
  const identity = await requireAdminIdentity(event)
  const { env, accountId, accountName: configuredAccountName } = requireAdminConfig(event)
  let accountName = configuredAccountName
  const token = env.DISCOFLARE_ADMIN_TOKEN?.trim()
  if (token) {
    const account = await cloudflareClient(token).accounts.get({ account_id: accountId }).catch(() => null)
    if (account?.name) accountName = account.name
  }
  return {
    accountId,
    accountName,
    email: identity.email,
    tokenConnected: Boolean(token),
    tokenTemplateUrl: accountAdminTokenTemplateUrl(),
    latestVersion: await latestWorkspaceVersion(event),
  }
})
