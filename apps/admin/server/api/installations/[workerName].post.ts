import { installDiscoflare, listDiscoflareInstallations } from '@discoflare/installer-core'
import { requireAccountToken, requireAdminConfig } from '../../utils/cloudflare'
import { assertAdminMutation, requireAdminIdentity } from '../../utils/security'

export default defineEventHandler(async (event) => {
  assertAdminMutation(event)
  await requireAdminIdentity(event)
  const token = requireAccountToken(event)
  const { accountId, origin, workerName: adminWorkerName } = requireAdminConfig(event)
  const workerName = getRouterParam(event, 'workerName') || ''
  const installation = (await listDiscoflareInstallations(token, accountId))
    .find(candidate => candidate.workerName === workerName)
  if (!installation) throw createError({ statusCode: 404, statusMessage: 'Discoflare installation not found' })
  const body = await readBody<{ targetVersion?: unknown }>(event)
  const targetVersion = typeof body?.targetVersion === 'string' ? body.targetVersion : undefined
  return installDiscoflare(token, {
    ...installation.configuration,
    managementMode: 'admin',
    adminOrigin: origin,
    adminWorkerName,
    realtimekitEnabled: true,
    mailEnabled: installation.configuration.mailEnabled
      || (installation.resources.primary && installation.configuration.customDomainEnabled),
    targetVersion,
  })
})
