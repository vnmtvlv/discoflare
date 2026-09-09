import { installDiscoflare, listDiscoflareInstallations, parseDeployRequest } from '@discoflare/installer-core'
import { requireAccountToken, requireAdminConfig } from '../../utils/cloudflare'
import { assertAdminMutation, requireAdminIdentity } from '../../utils/security'

export default defineEventHandler(async (event) => {
  assertAdminMutation(event)
  await requireAdminIdentity(event)
  const token = requireAccountToken(event)
  const { accountId, origin, workerName: adminWorkerName } = requireAdminConfig(event)
  const existing = await listDiscoflareInstallations(token, accountId)
  const body = await readBody(event)
  const requested = parseDeployRequest({
    ...(body && typeof body === 'object' ? body : {}),
    accountId,
    managementMode: 'admin',
    adminOrigin: origin,
    adminWorkerName,
    realtimekitEnabled: true,
  })
  const primaryExists = existing.some(installation => installation.resources.primary)
  const request = {
    ...requested,
    mailEnabled: requested.customDomainEnabled && !primaryExists,
    mailSubdomain: requested.appSubdomain,
    mailLocalPart: requested.mailLocalPart || 'inbox',
  }
  return installDiscoflare(token, request)
})
