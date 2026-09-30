import type { RealtimeKitSettingsAdminDTO } from '../../../../shared/types'
import { loadRealtimeKitConfig, realtimekitSettingsAdminDto } from '../../../../workers/realtimekit'
import { cf, fail } from '../../../utils/cf'
import { discoflareAdmin, discoflareAdminWorkspaceUrl } from '../../../../workers/discoflare-admin'
import { requireMember } from '../../../utils/guards'

export default defineEventHandler(async (event): Promise<{ realtimekit: RealtimeKitSettingsAdminDTO }> => {
  setHeader(event, 'Cache-Control', 'no-store')
  const workspaceId = getRouterParam(event, 'id')!
  const member = await requireMember(event, workspaceId)
  if (!member.isOwner) fail(403, 'forbidden', 'Only the owner can manage RealtimeKit')
  const { env } = cf(event)
  const admin = discoflareAdmin(env)
  if (admin) {
    const live = await admin.liveStatus().catch(() => null)
    return {
      realtimekit: {
        ...realtimekitSettingsAdminDto(await loadRealtimeKitConfig(env)),
        configured: true,
        source: 'admin',
        appId: live?.appId ?? null,
        adminUrl: await discoflareAdminWorkspaceUrl(env),
      },
    }
  }
  return { realtimekit: realtimekitSettingsAdminDto(await loadRealtimeKitConfig(env)) }
})
