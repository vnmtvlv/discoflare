import { version as packageVersion } from '../../../../package.json'
import { installDiscoflare, verifyInstanceAdminCredential } from '../../../../packages/installer-core/src/index'
import type { InstallationManagementStatusDTO } from '../../../../shared/releases'
import { WORKSPACE_ID } from '../../../../shared/ids'
import { cf, fail } from '../../../utils/cf'
import { requireMember } from '../../../utils/guards'
import { managedActivationRequest } from '../../../utils/installation-management'
import { writeAudit } from '../../../utils/messages'

function publicMessage(error: unknown) {
  if (error && typeof error === 'object' && 'statusMessage' in error) return String(error.statusMessage)
  return error instanceof Error ? error.message : 'Cloudflare management could not be connected'
}

export default defineEventHandler(async (event): Promise<{ management: InstallationManagementStatusDTO }> => {
  const workspaceId = getRouterParam(event, 'id')!
  const member = await requireMember(event, workspaceId)
  if (!member.isOwner) fail(403, 'forbidden', 'Only the owner can manage this installation')

  const value = await readBody<{ token?: unknown }>(event)
  const token = typeof value?.token === 'string' ? value.token.trim() : ''
  if (!token || token.length > 4_000) fail(400, 'invalid_token', 'Paste the Instance Admin Token created in Cloudflare')

  const { env } = cf(event)
  const accountId = env.DISCOFLARE_ACCOUNT_ID?.trim() || ''
  if (!accountId || !env.DISCOFLARE_WORKER_NAME || !env.DISCOFLARE_APP_HOSTNAME) {
    fail(409, 'management_unavailable', 'This deployment does not contain guided installation metadata')
  }

  const targetVersion = `v${packageVersion}`
  const request = managedActivationRequest(env, targetVersion)
  try {
    const credential = await verifyInstanceAdminCredential(token, accountId)
    await installDiscoflare(token, request, { managedCredential: credential })
  }
  catch (error) {
    fail(502, 'management_connect_failed', publicMessage(error))
  }

  await writeAudit(env, {
    workspaceId: WORKSPACE_ID,
    actorId: member.user.id,
    action: 'installation.management.connect',
    targetType: 'workspace',
    targetId: WORKSPACE_ID,
    meta: {
      huddles: true,
      email: request.mailEnabled,
    },
  })
  return {
    management: {
      available: true,
      managementMode: 'managed',
      adminOrigin: null,
      workerName: request.workerName,
      hostname: env.DISCOFLARE_APP_HOSTNAME,
      customDomainEnabled: request.customDomainEnabled,
      tokenTemplateUrl: null,
      huddlesEnabled: true,
      agentComputerEnabled: request.agentComputerEnabled,
      emailEnabled: request.mailEnabled,
      emailDomain: request.mailEnabled ? `${request.mailSubdomain}.${request.zoneName}` : null,
      emailEligible: Boolean(request.zoneId && request.zoneName && env.DISCOFLARE_PRIMARY === 'true'),
    },
  }
})
