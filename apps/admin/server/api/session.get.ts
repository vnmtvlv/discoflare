import { accountAdminTokenTemplateUrl, cloudflareClient } from '@discoflare/installer-core'
import type { AdminSession } from '../../shared/types'
import { adminCredentialMode, requireAdminConfig } from '../utils/cloudflare'
import { latestAdminVersion, latestWorkspaceVersion } from '../utils/releases'
import { requireAdminIdentity } from '../utils/security'

const ACCOUNT_NAME_TTL_MS = 10 * 60_000
const accountNameCache = new Map<string, { value: string, expiresAt: number }>()

async function cachedAccountName(token: string, accountId: string, fallback: string) {
  const cached = accountNameCache.get(accountId)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  const account = await cloudflareClient(token).accounts.get({ account_id: accountId }).catch(() => null)
  const value = account?.name || fallback
  accountNameCache.set(accountId, { value, expiresAt: Date.now() + ACCOUNT_NAME_TTL_MS })
  return value
}

export default defineEventHandler(async (event): Promise<AdminSession> => {
  const identity = await requireAdminIdentity(event)
  const { env, accountId, accountName: configuredAccountName } = requireAdminConfig(event)
  const token = env.DISCOFLARE_ADMIN_TOKEN?.trim()
  const credentialMode = adminCredentialMode(env)
  const [latestVersion, newestAdminVersion, accountName] = await Promise.all([
    latestWorkspaceVersion(event),
    latestAdminVersion(event),
    token ? cachedAccountName(token, accountId, configuredAccountName) : configuredAccountName,
  ])
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
