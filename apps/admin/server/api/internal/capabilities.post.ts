import { installDiscoflare, listDiscoflareInstallations, verifyAdminCapability } from '@discoflare/installer-core'
import { sendStream, setResponseHeaders } from 'h3'
import { requireAccountToken, requireAdminConfig } from '../../utils/cloudflare'
import { createDeployStream } from '../../utils/deploy-stream'

type CapabilityRequest = {
  accountId?: unknown
  workerName?: unknown
  capability?: unknown
  zoneId?: unknown
  zoneName?: unknown
  appSubdomain?: unknown
  emailEnabled?: unknown
}

export default defineEventHandler(async (event) => {
  const body = await readBody<CapabilityRequest>(event)
  const requestedAccountId = typeof body?.accountId === 'string' ? body.accountId.trim() : ''
  const requestedWorkerName = typeof body?.workerName === 'string' ? body.workerName.trim() : ''
  const capability = body?.capability === 'agent-computer' || body?.capability === 'huddles' || body?.capability === 'domain'
    ? body.capability
    : null
  if (!capability) throw createError({ statusCode: 400, statusMessage: 'Capability is invalid' })

  const { accountId, origin, sessionSecret, workerName: adminWorkerName } = requireAdminConfig(event)
  if (requestedAccountId !== accountId) throw createError({ statusCode: 403, statusMessage: 'Cloudflare account mismatch' })
  const bearer = getHeader(event, 'authorization')?.replace(/^Bearer\s+/iu, '').trim() || ''
  const stableCapability = await verifyAdminCapability(sessionSecret, bearer, accountId, requestedWorkerName)
  const token = await requireAccountToken(event)
  const legacyCapability = !stableCapability
    && await verifyAdminCapability(token, bearer, accountId, requestedWorkerName)
  if (!stableCapability && !legacyCapability) {
    throw createError({ statusCode: 403, statusMessage: 'Installation capability is invalid' })
  }

  const installation = (await listDiscoflareInstallations(token, accountId))
    .find(candidate => candidate.workerName === requestedWorkerName)
  if (!installation
    || installation.configuration.managementMode !== 'admin'
    || installation.configuration.adminWorkerName !== adminWorkerName) {
    throw createError({ statusCode: 403, statusMessage: 'Installation is not managed by this Discoflare Admin' })
  }

  const request = {
    ...installation.configuration,
    managementMode: 'admin' as const,
    adminOrigin: origin,
    adminWorkerName,
    realtimekitEnabled: capability === 'huddles' ? true : installation.configuration.realtimekitEnabled,
    agentComputerEnabled: capability === 'agent-computer' ? true : installation.configuration.agentComputerEnabled,
    customDomainEnabled: capability === 'domain' ? true : installation.configuration.customDomainEnabled,
    zoneId: capability === 'domain' ? String(body.zoneId || '').trim() : installation.configuration.zoneId,
    zoneName: capability === 'domain' ? String(body.zoneName || '').trim().toLowerCase() : installation.configuration.zoneName,
    appSubdomain: capability === 'domain' ? String(body.appSubdomain || '').trim().toLowerCase() : installation.configuration.appSubdomain,
    mailEnabled: capability === 'domain' && body.emailEnabled === true
      ? true
      : installation.configuration.mailEnabled,
    mailSubdomain: capability === 'domain' ? String(body.appSubdomain || '').trim().toLowerCase() : installation.configuration.mailSubdomain,
  }

  setResponseHeaders(event, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    'X-Accel-Buffering': 'no',
  })
  return sendStream(event, createDeployStream(report => installDiscoflare(token, request, {
    report,
    verification: 'client',
    adminCapabilityKey: sessionSecret,
  })))
})
