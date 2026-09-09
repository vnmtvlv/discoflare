import { accountAdminTokenTemplateUrl, cloudflareClient } from '@discoflare/installer-core'
import type { AdminSession } from '../../shared/types'
import { adminCredentialMode, requireAdminConfig } from '../utils/cloudflare'
import { latestAdminVersion, latestWorkspaceVersion } from '../utils/releases'
import { requireAdminIdentity } from '../utils/security'

export default defineEventHandler(async (event): Promise<AdminSession> => {
  const identity = await requireAdminIdentity(event)
  const { env, accountId, accountName: configuredAccountName } = requireAdminConfig(event)
  let accountName = configuredAccountName
  const token = env.DISCOFLARE_ADMIN_TOKEN?.trim()
  const credentialMode = adminCredentialMode(env)
  const [latestVersion, newestAdminVersion] = await Promise.all([
    latestWorkspaceVersion(event),
    latestAdminVersion(event),
  ])
  if (token) {
    const account = await cloudflareClient(token).accounts.get({ account_id: accountId }).catch(() => null)
    if (account?.name) accountName = account.name
  }
  return {
    accountId,
    accountName,
    email: identity.email,
    tokenConnected: credentialMode !== 'none',
    credentialMode,
    tokenTemplateUrl: accountAdminTokenTemplateUrl(),
    version: env.DISCOFLARE_ADMIN_VERSION?.trim() || null,
    latestAdminVersion: newestAdminVersion,
    latestVersion,
  }
})
