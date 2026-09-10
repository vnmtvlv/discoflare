import { bootstrapDiscoflareAdmin, cloudflareClient, type DiscoflareAdminBootstrapResponse } from '@discoflare/installer-core'
import { installerConfig } from '../../utils/installer-config'
import { assertInstallerMutation } from '../../utils/installer-security'
import { requireCloudflareToken, useInstallerSession } from '../../utils/installer-session'
import { createAdminBootstrapStream } from '../../utils/admin-bootstrap-stream'

export default defineEventHandler(async (event) => {
  assertInstallerMutation(event)
  const accessToken = await requireCloudflareToken(event)
  const body = await readBody<{ accountId?: unknown }>(event)
  const accountId = typeof body?.accountId === 'string' ? body.accountId.trim() : ''
  if (!/^[0-9a-f]{32}$/u.test(accountId)) throw createError({ statusCode: 400, statusMessage: 'Select a Cloudflare account' })

  const manifestUrl = installerConfig(event).adminInstallerManifestUrl
  if (typeof manifestUrl !== 'string' || !manifestUrl.startsWith('https://')) {
    throw createError({ statusCode: 503, statusMessage: 'Discoflare Admin release is not configured' })
  }
  const stream = createAdminBootstrapStream(async (): Promise<DiscoflareAdminBootstrapResponse> => {
    const client = cloudflareClient(accessToken)
    const [account, user] = await Promise.all([
      client.accounts.get({ account_id: accountId }),
      client.user.get(),
    ])
    if (account.id !== accountId) throw createError({ statusCode: 403, statusMessage: 'Cloudflare account is unavailable' })
    const installed = await bootstrapDiscoflareAdmin(accessToken, {
      accountId,
      accountName: account.name,
      email: user.email,
      userId: user.id,
    }, { manifestUrl, loginOrigin: installerConfig(event).installerOrigin })
    const session = await useInstallerSession(event)
    await session.update({ cloudflare: undefined, oauthPending: undefined })
    return installed
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
