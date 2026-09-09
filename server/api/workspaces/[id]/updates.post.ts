import { installDiscoflare } from '../../../../packages/installer-core/src/index'
import { compareStableVersions, stableSemver } from '../../../../shared/releases'
import { cf, fail } from '../../../utils/cf'
import { requireMember } from '../../../utils/guards'
import { managedUpdateRequest } from '../../../utils/installation-management'

export default defineEventHandler(async (event) => {
  const workspaceId = getRouterParam(event, 'id')!
  const member = await requireMember(event, workspaceId)
  if (!member.isOwner) fail(403, 'forbidden', 'Only the owner can manage updates')

  const { targetVersion } = await readBody<{ targetVersion?: string }>(event)
  const target = typeof targetVersion === 'string' ? targetVersion.trim() : ''
  if (!stableSemver(target)) fail(400, 'invalid_version', 'Select a stable Discoflare release')

  const { env } = cf(event)
  const installed = env.DISCOFLARE_VERSION?.trim() || ''
  if (stableSemver(installed) && compareStableVersions(target, installed) <= 0) {
    fail(409, 'not_newer', 'Select a release newer than the installed version')
  }
  const token = env.DISCOFLARE_ADMIN_TOKEN?.trim()
  const tokenId = env.DISCOFLARE_ADMIN_TOKEN_ID?.trim()
  if (env.DISCOFLARE_MANAGEMENT_MODE !== 'managed' || !token || !tokenId) {
    fail(409, 'manual_management', 'This installation requires discoflare.com or the CLI for updates')
  }

  try {
    return await installDiscoflare(token, managedUpdateRequest(env, target), {
      managedCredential: { id: tokenId, value: token },
    })
  }
  catch (error) {
    const message = error && typeof error === 'object' && 'statusMessage' in error
      ? String(error.statusMessage)
      : error instanceof Error ? error.message : 'Managed update failed'
    fail(502, 'managed_update_failed', message)
  }
})
