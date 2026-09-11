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
  const body = await readBody<{ accountId?: unknown }>(event)
  const accountId = typeof body?.accountId === 'string' ? body.accountId.trim() : ''
  if (!/^[0-9a-f]{32}$/u.test(accountId)) throw createError({ statusCode: 400, statusMessage: 'Select a Cloudflare account' })

  const client = cloudflareClient(accessToken)
  const [account, user] = await Promise.all([
    client.accounts.get({ account_id: accountId }),
    client.user.get(),
  ])
  if (account.id !== accountId) throw createError({ statusCode: 403, statusMessage: 'Cloudflare account is unavailable' })
  const manifestUrl = installerConfig(event).adminInstallerManifestUrl
  if (typeof manifestUrl !== 'string' || !manifestUrl.startsWith('https://')) {
    throw createError({ statusCode: 503, statusMessage: 'Discoflare Admin release is not configured' })
  }

  const installed = await bootstrapDiscoflareAdmin(accessToken, {
    accountId,
    accountName: account.name,
    email: user.email,
    userId: user.id,
  }, {
    manifestUrl,
    managedOAuth: {
      accessToken,
      refreshToken: credential.refreshToken,
      clientId: installerConfig(event).cloudflareOAuthClientId,
      expiresAt: credential.expiresAt,
    },
    loginOrigin: installerConfig(event).installerOrigin,
  })

  const handoff = new URL('/bootstrap', installed.origin)
  handoff.hash = new URLSearchParams({ token: accessToken }).toString()
  const result = {
    ...installed,
    managementMode: 'managed' as const,
    tokenConnected: true,
    handoffUrl: handoff.toString(),
  }
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
  await session.update({
    cloudflare: undefined,
    oauthPending: undefined,
    managedAdmins,
    installHandoff: {
      accountId,
      accountName: account.name,
      origin: result.origin,
      workerName: result.workerName,
      version: result.version,
      handoffUrl: handoff.toString(),
      expiresAt: credential.expiresAt,
    },
  })
  return result
})
