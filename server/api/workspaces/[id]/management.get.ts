import type { InstallationManagementStatusDTO } from '../../../../shared/releases'
import { cf, fail } from '../../../utils/cf'
import { requireMember } from '../../../utils/guards'

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
  const managed = env.DISCOFLARE_MANAGEMENT_MODE === 'managed'
    && Boolean(env.DISCOFLARE_ADMIN_TOKEN && env.DISCOFLARE_ADMIN_TOKEN_ID)
  const adminManaged = env.DISCOFLARE_MANAGEMENT_MODE === 'admin'
    && Boolean(env.DISCOFLARE_ADMIN && env.DISCOFLARE_ADMIN_CAPABILITY && env.DISCOFLARE_ADMIN_ORIGIN)
  const emailDomain = env.MAIL_DOMAIN?.trim()
    || (env.DISCOFLARE_PRIMARY === 'true' && env.DISCOFLARE_ZONE_NAME
      ? `${env.DISCOFLARE_APP_SUBDOMAIN?.trim() || workerName}.${env.DISCOFLARE_ZONE_NAME.trim()}`
      : null)

  return {
    available,
    managementMode: adminManaged ? 'admin' : managed ? 'managed' : 'manual',
    adminOrigin: adminManaged ? env.DISCOFLARE_ADMIN_ORIGIN!.trim() : null,
    workerName: workerName || null,
    hostname: hostname || null,
    tokenTemplateUrl: null,
    huddlesEnabled: Boolean(env.REALTIMEKIT_ACCOUNT_ID && env.REALTIMEKIT_APP_ID),
    emailEnabled: Boolean(env.MAIL_ZONE_ID && emailDomain),
    emailDomain,
    emailEligible: env.DISCOFLARE_PRIMARY === 'true'
      && Boolean(env.DISCOFLARE_ZONE_ID && env.DISCOFLARE_ZONE_NAME),
  }
})
