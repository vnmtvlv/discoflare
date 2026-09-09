import { cloudflareClient, listDiscoflareInstallations, type CloudflareZone } from '@discoflare/installer-core'
import type { InstallationList } from '../../../shared/types'
import { requireAccountToken, requireAdminConfig } from '../../utils/cloudflare'
import { latestWorkspaceVersion } from '../../utils/releases'
import { requireAdminIdentity } from '../../utils/security'

export default defineEventHandler(async (event): Promise<InstallationList> => {
  await requireAdminIdentity(event)
  const token = await requireAccountToken(event)
  const { accountId } = requireAdminConfig(event)
  const client = cloudflareClient(token)
  const zones: CloudflareZone[] = []
  for await (const zone of client.zones.list({ account: { id: accountId }, per_page: 50 })) {
    if (!zone.id || !zone.name) continue
    zones.push({ id: zone.id, accountId, name: zone.name, status: zone.status || 'unknown' })
  }
  return {
    installations: await listDiscoflareInstallations(token, accountId),
    zones,
    latestVersion: await latestWorkspaceVersion(event),
  }
})
