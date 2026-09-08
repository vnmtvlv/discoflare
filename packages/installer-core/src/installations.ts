import type { CloudflareInstallation, CloudflareZone, DeployRequest } from './types.js'
import { cloudflareClient } from './cloudflare-client.js'
import { type ExistingWorkerBinding, isDiscoflareWorker } from './deploy.js'
import { createError } from './errors.js'

export function installationHostname(value: unknown) {
  if (typeof value !== 'string') throw createError({ statusCode: 400, statusMessage: 'Installation origin is missing' })
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error()
    return url.hostname.toLowerCase()
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'Installation origin is invalid' })
  }
}

function subdomain(hostname: string, zoneName: string) {
  const suffix = `.${zoneName}`
  return hostname.endsWith(suffix) ? hostname.slice(0, -suffix.length) : ''
}

function textBinding(bindings: ExistingWorkerBinding[], name: string) {
  return bindings.find(binding => binding.name === name && binding.type === 'plain_text')?.text?.trim() || ''
}

function installationConfiguration(
  accountId: string,
  workerName: string,
  hostname: string,
  bindings: ExistingWorkerBinding[],
  zones: CloudflareZone[],
): DeployRequest | null {
  const appZone = zones
    .filter(item => item.accountId === accountId && item.status === 'active' && (hostname === item.name || hostname.endsWith(`.${item.name}`)))
    .sort((left, right) => right.name.length - left.name.length)[0]
  const customDomainEnabled = Boolean(appZone)
  if (!customDomainEnabled && !hostname.endsWith('.workers.dev')) return null
  const appSubdomain = appZone ? subdomain(hostname, appZone.name) : workerName
  if (appZone && !appSubdomain) return null
  const mailDomain = textBinding(bindings, 'MAIL_DOMAIN')
  const mailZoneId = textBinding(bindings, 'MAIL_ZONE_ID')
  const selectedZone = zones.find(item => item.accountId === accountId && item.id === mailZoneId) || appZone
  const mailSubdomain = selectedZone ? subdomain(mailDomain, selectedZone.name) : ''
  const mailEnabled = Boolean(mailDomain && mailZoneId && mailSubdomain)
  const registration = textBinding(bindings, 'AUTH_REGISTRATION_MODE')
  const mode = textBinding(bindings, 'AUTH_MODE') === 'access' ? 'access' : 'builtin'
  const realtimekitEnabled = Boolean(
    textBinding(bindings, 'REALTIMEKIT_ACCOUNT_ID')
    && textBinding(bindings, 'REALTIMEKIT_APP_ID')
    && bindings.some(binding => binding.name === 'REALTIMEKIT_API_KEY' && binding.type === 'secret_text'),
  )

  return {
    accountId,
    workerName,
    adminEmail: '',
    allowedEmails: [],
    appName: textBinding(bindings, 'APP_NAME') || textBinding(bindings, 'ADMIN_WORKSPACE') || 'Discoflare',
    authMode: mode,
    registrationMode: registration === 'open' ? 'open' : 'invite_only',
    customDomainEnabled,
    zoneId: selectedZone?.id || '',
    zoneName: selectedZone?.name || '',
    appSubdomain,
    mailEnabled,
    mailSubdomain: mailEnabled ? mailSubdomain : customDomainEnabled ? appSubdomain : 'discoflare',
    mailLocalPart: textBinding(bindings, 'MAIL_DEFAULT_LOCAL_PART') || 'inbox',
    realtimekitEnabled,
    realtimekitApiToken: '',
  }
}

export async function findDiscoflareInstallations(accessToken: string, origin: unknown): Promise<CloudflareInstallation[]> {
  const hostname = installationHostname(origin)
  const client = cloudflareClient(accessToken)
  const accounts = []
  for await (const account of client.accounts.list({ per_page: 50 })) accounts.push(account)
  const zones: CloudflareZone[] = []
  for await (const zone of client.zones.list({ per_page: 50 })) {
    if (!zone.id || !zone.name || !zone.account?.id) continue
    zones.push({ id: zone.id, name: zone.name, accountId: zone.account.id, status: zone.status || 'unknown' })
  }
  const candidateAccountIds = hostname.endsWith('.workers.dev')
    ? new Set(accounts.map(account => account.id))
    : new Set(zones
        .filter(zone => zone.status === 'active' && (hostname === zone.name || hostname.endsWith(`.${zone.name}`)))
        .map(zone => zone.accountId))

  const installations: CloudflareInstallation[] = []
  for (const account of accounts) {
    if (!candidateAccountIds.has(account.id)) continue
    for await (const worker of client.workers.scripts.list({ account_id: account.id })) {
      if (!worker.id) continue
      const settings = await client.workers.scripts.scriptAndVersionSettings.get(worker.id, { account_id: account.id })
      const bindings = settings.bindings as ExistingWorkerBinding[] || []
      if (!isDiscoflareWorker(bindings)) continue
      const appHostname = textBinding(bindings, 'DISCOFLARE_APP_HOSTNAME') || textBinding(bindings, 'MAIL_APP_HOSTNAME')
      if (appHostname.toLowerCase() !== hostname) continue
      const configuration = installationConfiguration(account.id, worker.id, hostname, bindings, zones)
      if (!configuration) continue
      installations.push({
        accountId: account.id,
        workerName: worker.id,
        origin: `https://${hostname}`,
        version: textBinding(bindings, 'DISCOFLARE_VERSION') || null,
        configuration,
        resources: {
          databaseId: bindings.find(binding => binding.name === 'DB' && binding.type === 'd1')?.database_id || null,
          bucketName: bindings.find(binding => binding.name === 'FILES' && binding.type === 'r2_bucket')?.bucket_name || null,
          kvId: bindings.find(binding => binding.name === 'TICKETS' && binding.type === 'kv_namespace')?.namespace_id || null,
          workflowName: bindings.find(binding => binding.name === 'AGENT_TASK_WORKFLOW' && binding.type === 'workflow')?.workflow_name || `${worker.id}-agent-tasks`,
          containerName: `${worker.id}-computer`,
          mailZoneId: textBinding(bindings, 'MAIL_ZONE_ID') || null,
          mailDomain: textBinding(bindings, 'MAIL_DOMAIN') || null,
          telemetryId: textBinding(bindings, 'DISCOFLARE_TELEMETRY_ID') || null,
          accessApplicationId: textBinding(bindings, 'CF_ACCESS_APP_ID') || null,
          accessHealthApplicationId: textBinding(bindings, 'CF_ACCESS_HEALTH_APP_ID') || null,
          accessDeletionApplicationId: textBinding(bindings, 'CF_ACCESS_DELETION_APP_ID') || null,
          realtimekitAppId: textBinding(bindings, 'REALTIMEKIT_APP_ID') || null,
          realtimekitManaged: textBinding(bindings, 'DISCOFLARE_REALTIMEKIT_MANAGED') === 'true',
        },
      })
    }
  }
  return installations
}
