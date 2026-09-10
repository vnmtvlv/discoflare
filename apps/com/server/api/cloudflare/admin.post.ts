import { bootstrapDiscoflareAdmin, cloudflareClient, type DiscoflareAdminBootstrapResponse } from '@discoflare/installer-core'
import { installerConfig } from '../../utils/installer-config'
import { assertInstallerMutation } from '../../utils/installer-security'
import { requireCloudflareToken } from '../../utils/installer-session'
import { createAdminBootstrapStream } from '../../utils/admin-bootstrap-stream'

export default defineEventHandler(async (event) => {
  assertInstallerMutation(event)
  const accessToken = await requireCloudflareToken(event)
  const body = await readBody<{ accountId?: unknown, email?: unknown }>(event)
  const accountId = typeof body?.accountId === 'string' ? body.accountId.trim() : ''
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!/^[0-9a-f]{32}$/u.test(accountId)) throw createError({ statusCode: 400, statusMessage: 'Select a Cloudflare account' })
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(email)) throw createError({ statusCode: 400, statusMessage: 'Enter the email allowed into Discoflare Admin' })

  const manifestUrl = installerConfig(event).adminInstallerManifestUrl
  if (typeof manifestUrl !== 'string' || !manifestUrl.startsWith('https://')) {
    throw createError({ statusCode: 503, statusMessage: 'Discoflare Admin release is not configured' })
  }
  const stream = createAdminBootstrapStream(async (): Promise<DiscoflareAdminBootstrapResponse> => {
    const account = await cloudflareClient(accessToken).accounts.get({ account_id: accountId })
    if (account.id !== accountId) throw createError({ statusCode: 403, statusMessage: 'Cloudflare account is unavailable' })
    return bootstrapDiscoflareAdmin(accessToken, {
      accountId,
      accountName: account.name,
      email,
    }, { manifestUrl })
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
