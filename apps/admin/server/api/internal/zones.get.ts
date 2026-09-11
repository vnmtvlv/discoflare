import { listAccountZones, readDiscoflareInstallation, verifyAdminCapability, type CloudflareZone } from '@discoflare/installer-core'
import { requireAccountToken, requireAdminConfig } from '../../utils/cloudflare'

export default defineEventHandler(async (event): Promise<{ zones: CloudflareZone[] }> => {
  const requestedAccountId = getHeader(event, 'x-discoflare-account-id')?.trim() || ''
  const requestedWorkerName = getHeader(event, 'x-discoflare-worker-name')?.trim() || ''
  const bearer = getHeader(event, 'authorization')?.replace(/^Bearer\s+/iu, '').trim() || ''
  const { accountId, sessionSecret, workerName: adminWorkerName } = requireAdminConfig(event)
  if (requestedAccountId !== accountId) {
    throw createError({ statusCode: 403, statusMessage: 'Installation capability is invalid' })
  }

  const token = await requireAccountToken(event)
  const stableCapability = await verifyAdminCapability(sessionSecret, bearer, accountId, requestedWorkerName)
  const legacyCapability = !stableCapability
    && await verifyAdminCapability(token, bearer, accountId, requestedWorkerName)
  if (!stableCapability && !legacyCapability) {
    throw createError({ statusCode: 403, statusMessage: 'Installation capability is invalid' })
  }
  const [installation, zones] = await Promise.all([
    readDiscoflareInstallation(token, accountId, requestedWorkerName),
    listAccountZones(token, accountId),
  ])
  if (!installation
    || installation.configuration.managementMode !== 'admin'
    || installation.configuration.adminWorkerName !== adminWorkerName) {
    throw createError({ statusCode: 403, statusMessage: 'Installation is not managed by this Discoflare Admin' })
  }

  return { zones: zones.filter(zone => zone.status === 'active').sort((a, b) => a.name.localeCompare(b.name)) }
})
