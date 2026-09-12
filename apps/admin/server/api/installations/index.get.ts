import { listAccountZones, listDiscoflareInstallations } from '@discoflare/installer-core'
import type { InstallationList } from '../../../shared/types'
import { requireAccountToken, requireAdminConfig } from '../../utils/cloudflare'
import { latestWorkspaceVersion } from '../../utils/releases'
import { requireAdminIdentity } from '../../utils/security'

export default defineEventHandler(async (event): Promise<InstallationList> => {
  await requireAdminIdentity(event)
  const token = await requireAccountToken(event)
  const { accountId } = requireAdminConfig(event)
  const zones = await listAccountZones(token, accountId)
  const [installations, latestVersion] = await Promise.all([
    listDiscoflareInstallations(token, accountId, { zones }),
    latestWorkspaceVersion(event),
  ])
  return { installations, zones, latestVersion }
})
