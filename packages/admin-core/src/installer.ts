import { cloudflareClient } from './cloudflare-client.js'
import { deployDiscoflare, deployDiscoflareUpdate } from './deploy.js'
import { createError } from './errors.js'
import { loadDiscoflareRelease, releaseManifestUrl } from './release.js'
import { parseBaseInstallRequest, parseDeployRequest } from './request.js'
import type { DeployProgressReporter, DeployProgressStep, DeployResponse, InstallationControl } from './types.js'
import type { WorkspaceAdminLink } from './admin-link.js'

export type InstallDiscoflareOptions = {
  manifestUrl?: string
  report?: DeployProgressReporter
  /** Legacy: an Installation Control Credential issued by discoflare.com. */
  control?: InstallationControl
  /** Link the workspace to this account's Discoflare Admin. */
  admin?: WorkspaceAdminLink
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

  const deployed = await deployDiscoflare(
    client,
    accessToken,
    request,
    release,
    options.report,
    options.control,
    options.admin ?? null,
  )
  const { telemetry: _telemetry, ...response } = deployed
  return response
}

export async function installBaseDiscoflare(
  accessToken: string,
  value: unknown,
  options: InstallDiscoflareOptions = {},
): Promise<DeployResponse> {
  const request = parseBaseInstallRequest(value)
  return installDiscoflare(accessToken, {
    ...request,
    customDomainEnabled: false,
    zoneId: '',
    zoneName: '',
    appSubdomain: request.workerName,
    mailEnabled: false,
    mailSubdomain: '',
    mailLocalPart: '',
  }, options)
}

export async function updateDiscoflare(
  accessToken: string,
  value: { accountId?: unknown, workerName?: unknown, targetVersion?: unknown },
  options: { admin?: WorkspaceAdminLink, manifestUrl?: string } = {},
): Promise<DeployResponse> {
  if (!accessToken.trim()) throw createError({ statusCode: 401, statusMessage: 'Cloudflare API token is missing' })
  const accountId = String(value?.accountId || '').trim()
  const workerName = String(value?.workerName || '').trim().toLowerCase()
  const targetVersion = String(value?.targetVersion || '').trim()
  if (!/^[0-9a-f]{32}$/u.test(accountId)) throw createError({ statusCode: 400, statusMessage: 'Cloudflare account is invalid' })
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(workerName)) throw createError({ statusCode: 400, statusMessage: 'Worker name is invalid' })
  if (!/^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/u.test(targetVersion)) throw createError({ statusCode: 400, statusMessage: 'Discoflare release version is invalid' })
  const release = await loadDiscoflareRelease(options.manifestUrl || releaseManifestUrl(targetVersion))
  if (release.manifest.version !== targetVersion.replace(/^v/u, '')) {
    throw createError({ statusCode: 502, statusMessage: 'Discoflare release manifest version does not match the requested update' })
  }
  return deployDiscoflareUpdate(accessToken, accountId, workerName, release, options.admin ?? null)
}
