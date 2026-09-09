import { bootstrapDiscoflareAdmin } from '@discoflare/installer-core'
import { isNewerRelease } from '~~/shared/versions'
import { requireAccountToken, requireAdminConfig } from '../utils/cloudflare'
import { latestAdminVersion } from '../utils/releases'
import { assertAdminMutation, requireAdminIdentity } from '../utils/security'

export default defineEventHandler(async (event) => {
  assertAdminMutation(event)
  await requireAdminIdentity(event)
  const { accountId, accountName, email, env, workerName } = requireAdminConfig(event)
  const token = requireAccountToken(event)
  const latestVersion = await latestAdminVersion(event)
  if (!latestVersion) throw createError({ statusCode: 503, statusMessage: 'The latest Discoflare Admin release is unavailable' })

  const body: { targetVersion?: unknown } = await readBody<{ targetVersion?: unknown }>(event).catch(() => ({}))
  const targetVersion = typeof body.targetVersion === 'string' ? body.targetVersion.trim().replace(/^v/u, '') : latestVersion
  if (!/^\d+\.\d+\.\d+$/u.test(targetVersion) || targetVersion !== latestVersion) {
    throw createError({ statusCode: 409, statusMessage: 'The Discoflare Admin release changed. Reload and try again.' })
  }
  if (!isNewerRelease(env.DISCOFLARE_ADMIN_VERSION?.trim() || null, targetVersion)) {
    return { version: targetVersion, updated: false }
  }

  const result = await bootstrapDiscoflareAdmin(token, {
    accountId,
    accountName,
    email,
    workerName,
    targetVersion: `v${targetVersion}`,
  })
  return { version: result.version, updated: true }
})
