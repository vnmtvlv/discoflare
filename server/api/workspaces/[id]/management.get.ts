import type { InstallationManagementStatusDTO } from '../../../../shared/releases'
import { cf, fail } from '../../../utils/cf'
import { requireMember } from '../../../utils/guards'
import { agentComputerConfigured } from '../../../../workers/env'
import { workspaceMailDomains } from '../../../utils/workspace-mail'

export default defineEventHandler(async (event): Promise<InstallationManagementStatusDTO> => {
  setHeader(event, 'Cache-Control', 'no-store')
  const workspaceId = getRouterParam(event, 'id')!
  const member = await requireMember(event, workspaceId)
  if (!member.isOwner) fail(403, 'forbidden', 'Only the owner can manage this installation')

  const { env } = cf(event)
  const accountId = env.DISCOFLARE_ACCOUNT_ID?.trim() || ''
  const workerName = env.DISCOFLARE_WORKER_NAME?.trim() || ''
  const hostname = env.DISCOFLARE_APP_HOSTNAME?.trim() || ''
  const available = Boolean(accountId && workerName && hostname)
  const emailDomains = workspaceMailDomains(env).map(item => item.domain)

  return {
    available,
    workerName: workerName || null,
    hostname: hostname || null,
    primary: env.DISCOFLARE_PRIMARY === 'true',
    customDomainEnabled: env.DISCOFLARE_CUSTOM_DOMAIN === 'true',
    huddlesEnabled: Boolean(env.REALTIMEKIT_ACCOUNT_ID && env.REALTIMEKIT_APP_ID),
    agentComputerEnabled: agentComputerConfigured(env),
    emailEnabled: emailDomains.length > 0,
    emailDomains,
    emailEligible: env.DISCOFLARE_PRIMARY === 'true',
  }
})
