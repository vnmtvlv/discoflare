import { cloudflareClient } from './cloudflare-client.js'
import { deployDiscoflare } from './deploy.js'
import { createError } from './errors.js'
import { loadDiscoflareRelease, releaseManifestUrl } from './release.js'
import { parseDeployRequest } from './request.js'
import type { DeployProgressReporter, DeployProgressStep, DeployResponse } from './types.js'
import type { InstanceAdminCredential } from './instance-admin.js'

export type InstallDiscoflareOptions = {
  manifestUrl?: string
  report?: DeployProgressReporter
  managedCredential?: InstanceAdminCredential
}

/** Complete install/update operation. Credential acquisition and UI stay in the caller. */
export async function installDiscoflare(
  accessToken: string,
  value: unknown,
  options: InstallDiscoflareOptions = {},
): Promise<DeployResponse> {
  if (!accessToken.trim()) throw createError({ statusCode: 401, statusMessage: 'Cloudflare API token is missing' })
  const request = parseDeployRequest(value)
  const progress = async (step: DeployProgressStep, state: 'active' | 'complete', detail?: string) => {
    await options.report?.({ type: 'progress', step, state, detail })
  }

  await progress('account', 'active')
  const client = cloudflareClient(accessToken)
  const account = await client.accounts.get({ account_id: request.accountId })
  if (account.id !== request.accountId) throw createError({ statusCode: 403, statusMessage: 'Cloudflare account is unavailable' })
  if (request.customDomainEnabled || request.mailEnabled) {
    const zone = await client.zones.get({ zone_id: request.zoneId })
    if (zone.id !== request.zoneId || zone.name !== request.zoneName || zone.account?.id !== request.accountId) {
      throw createError({ statusCode: 403, statusMessage: 'Cloudflare domain is unavailable in this account' })
    }
  }
  await progress('account', 'complete', account.name || undefined)

  await progress('release', 'active')
  const manifestUrl = options.manifestUrl || releaseManifestUrl(request.targetVersion)
  const release = await loadDiscoflareRelease(manifestUrl)
  if (request.authMode === 'access' && !release.manifest.capabilities?.includes('cloudflare-access-auth')) {
    throw createError({ statusCode: 409, statusMessage: 'This Discoflare release does not support Cloudflare Access authentication' })
  }
  if (request.targetVersion && release.manifest.version !== request.targetVersion.replace(/^v/u, '')) {
    throw createError({ statusCode: 502, statusMessage: 'Discoflare release manifest version does not match the requested update' })
  }
  await progress('release', 'complete', `Discoflare ${release.manifest.version}`)

  const deployed = await deployDiscoflare(client, accessToken, request, release, options.report, options.managedCredential)
  const { telemetry: _telemetry, ...response } = deployed
  return response
}
