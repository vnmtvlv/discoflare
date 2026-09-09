import {
  bootstrapDiscoflareAdmin,
  cloudflareClient,
  type DiscoflareAdminBootstrapResponse,
} from '@discoflare/installer-core'
import { installerConfig } from '../../utils/installer-config'
import { assertInstallerMutation } from '../../utils/installer-security'
import { requireManagedCloudflareCredential, useInstallerSession } from '../../utils/installer-session'

export default defineEventHandler(async (event): Promise<DiscoflareAdminBootstrapResponse> => {
  assertInstallerMutation(event)
  const credential = await requireManagedCloudflareCredential(event)
  const accessToken = credential.accessToken
  const body = await readBody<{ accountId?: unknown, email?: unknown }>(event)
  const accountId = typeof body?.accountId === 'string' ? body.accountId.trim() : ''
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!/^[0-9a-f]{32}$/u.test(accountId)) throw createError({ statusCode: 400, statusMessage: 'Select a Cloudflare account' })
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(email)) throw createError({ statusCode: 400, statusMessage: 'Enter the email allowed into Discoflare Admin' })

  const client = cloudflareClient(accessToken)
  const account = await client.accounts.get({ account_id: accountId })
  if (account.id !== accountId) throw createError({ statusCode: 403, statusMessage: 'Cloudflare account is unavailable' })
  const manifestUrl = installerConfig(event).adminInstallerManifestUrl
  if (typeof manifestUrl !== 'string' || !manifestUrl.startsWith('https://')) {
    throw createError({ statusCode: 503, statusMessage: 'Discoflare Admin release is not configured' })
  }

  const config = installerConfig(event)
  const clientId = config.cloudflareManagedOAuthClientId
  if (!clientId) throw createError({ statusCode: 503, statusMessage: 'Managed Cloudflare OAuth is not configured' })
  const installed = await bootstrapDiscoflareAdmin(accessToken, {
    accountId,
    accountName: account.name,
    email,
  }, {
    manifestUrl,
    managedOAuth: {
      accessToken,
      refreshToken: credential.refreshToken,
      clientId,
      expiresAt: credential.expiresAt,
    },
  })

  const result = { ...installed, managementMode: 'managed' as const, tokenConnected: true }
  const session = await useInstallerSession(event)
  const managedAdmins = [
    ...(session.data.managedAdmins || []).filter(admin => admin.accountId !== accountId),
    {
      accountId,
      accountName: account.name,
      origin: result.origin,
      workerName: result.workerName,
      version: result.version,
    },
  ]
  await session.update({ cloudflare: undefined, oauthPending: undefined, managedAdmins })
  return result
})
