import type { DiscoflareEnv } from '../../workers/env'
import type { DeployRequest } from '../../packages/installer-core/src/types'

export function managedInstallationOrigin(env: DiscoflareEnv, requestOrigin: string): string {
  const hostname = env.DISCOFLARE_APP_HOSTNAME?.trim()
  if (!hostname) return new URL(requestOrigin).origin
  const origin = new URL(`https://${hostname}`)
  if (origin.hostname !== hostname || origin.pathname !== '/') throw new Error('DISCOFLARE_APP_HOSTNAME is invalid')
  return origin.origin
}

export function managedUninstallUrl(origin: string, claim: string): string {
  const url = new URL('/uninstall', 'https://discoflare.com')
  url.searchParams.set('origin', new URL(origin).origin)
  url.hash = new URLSearchParams({ claim }).toString()
  return url.toString()
}

export async function emptyLiveFiles(bucket: R2Bucket): Promise<number> {
  let deleted = 0
  while (true) {
    const page = await bucket.list({ limit: 1_000 })
    const keys = page.objects.map(object => object.key)
    if (!keys.length) return deleted
    await bucket.delete(keys)
    deleted += keys.length
  }
}

function subdomain(hostname: string, zoneName: string) {
  const suffix = `.${zoneName}`
  return hostname.endsWith(suffix) ? hostname.slice(0, -suffix.length) : ''
}

export function managedUpdateRequest(env: DiscoflareEnv, targetVersion: string): DeployRequest {
  const accountId = env.DISCOFLARE_ACCOUNT_ID?.trim() || ''
  const workerName = env.DISCOFLARE_WORKER_NAME?.trim() || ''
  const zoneId = env.DISCOFLARE_ZONE_ID?.trim() || env.MAIL_ZONE_ID?.trim() || ''
  const zoneName = env.DISCOFLARE_ZONE_NAME?.trim() || ''
  const hostname = env.DISCOFLARE_APP_HOSTNAME?.trim() || ''
  const customDomainEnabled = env.DISCOFLARE_CUSTOM_DOMAIN === 'true'
  const mailDomain = env.MAIL_DOMAIN?.trim() || ''
  const mailEnabled = Boolean(env.MAIL_ZONE_ID && mailDomain)
  if (!accountId || !workerName || !hostname) throw new Error('Managed installation identity is incomplete')
  if ((customDomainEnabled || mailEnabled) && (!zoneId || !zoneName)) throw new Error('Managed installation zone metadata is incomplete')

  return {
    accountId,
    workerName,
    managementMode: 'managed',
    adminEmail: '',
    allowedEmails: [],
    appName: env.APP_NAME?.trim() || env.ADMIN_WORKSPACE?.trim() || 'Discoflare',
    authMode: env.AUTH_MODE === 'access' ? 'access' : 'builtin',
    registrationMode: env.AUTH_REGISTRATION_MODE === 'open' ? 'open' : 'invite_only',
    customDomainEnabled,
    zoneId,
    zoneName,
    appSubdomain: env.DISCOFLARE_APP_SUBDOMAIN?.trim() || (customDomainEnabled ? subdomain(hostname, zoneName) : workerName),
    mailEnabled,
    mailSubdomain: mailEnabled ? subdomain(mailDomain, zoneName) : 'discoflare',
    mailLocalPart: env.MAIL_DEFAULT_LOCAL_PART?.trim() || 'inbox',
    realtimekitEnabled: Boolean(env.REALTIMEKIT_ACCOUNT_ID && env.REALTIMEKIT_APP_ID),
    realtimekitApiToken: '',
    agentComputerEnabled: env.DISCOFLARE_AGENT_COMPUTER_ENABLED
      ? env.DISCOFLARE_AGENT_COMPUTER_ENABLED === 'true'
      : Boolean(env.AGENT_TASK_WORKFLOW),
    targetVersion,
  }
}

/** Turn a guided installation into a self-managing installation from its own origin. */
export function managedActivationRequest(env: DiscoflareEnv, targetVersion: string): DeployRequest {
  const request = managedUpdateRequest(env, targetVersion)
  const canEnableMail = env.DISCOFLARE_PRIMARY === 'true'
    && Boolean(request.zoneId && request.zoneName)

  return {
    ...request,
    managementMode: 'managed',
    realtimekitEnabled: true,
    mailEnabled: request.mailEnabled || canEnableMail,
    mailSubdomain: request.mailEnabled
      ? request.mailSubdomain
      : env.DISCOFLARE_APP_SUBDOMAIN?.trim() || request.workerName,
  }
}

/** Disconnect management without requiring a second provider credential. */
export function manualManagementRequest(env: DiscoflareEnv, targetVersion: string): DeployRequest {
  return {
    ...managedUpdateRequest(env, targetVersion),
    managementMode: 'manual',
    realtimekitEnabled: false,
  }
}
