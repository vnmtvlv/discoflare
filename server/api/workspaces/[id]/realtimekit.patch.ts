import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { realtimekitSettings } from '../../../../drizzle/schema'
import type { RealtimeKitSettingsAdminDTO } from '../../../../shared/types'
import { nowIso, WORKSPACE_ID } from '../../../../shared/ids'
import { encryptSecret } from '../../../../shared/encrypted-secret'
import { loadRealtimeKitConfig, REALTIMEKIT_SECRET_SCOPE, realtimekitSettingsAdminDto } from '../../../../workers/realtimekit'
import { authSecret } from '../../../utils/auth-config'
import { cf, fail } from '../../../utils/cf'
import { getDb } from '../../../utils/db'
import { requireMember } from '../../../utils/guards'
import { writeAudit } from '../../../utils/messages'
import { parseBody } from '../../../utils/validate'

const configureSchema = z.object({
  remove: z.literal(false).optional(),
  accountId: z.string().trim().regex(/^[a-f0-9]{32}$/iu),
  appId: z.string().trim().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu),
  apiToken: z.string().max(4000).optional(),
  voicePreset: z.string().trim().min(1).max(100),
  avPreset: z.string().trim().min(1).max(100),
})

const bodySchema = z.union([
  z.object({ remove: z.literal(true) }),
  configureSchema,
])

export default defineEventHandler(async (event): Promise<{ realtimekit: RealtimeKitSettingsAdminDTO }> => {
  const workspaceId = getRouterParam(event, 'id')!
  const member = await requireMember(event, workspaceId)
  if (!member.isOwner) fail(403, 'forbidden', 'Only the owner can manage RealtimeKit')
  const body = parseBody(bodySchema, await readBody(event))
  const { env } = cf(event)
  const current = await loadRealtimeKitConfig(env)
  if (current.source === 'deployment') fail(400, 'managed_by_deployment', 'RealtimeKit is managed by the deployment')

  const db = getDb(env.DB)
  if (body.remove) {
    await db.delete(realtimekitSettings).where(eq(realtimekitSettings.id, 'main'))
    await writeAudit(env, {
      workspaceId: WORKSPACE_ID,
      actorId: member.user.id,
      action: 'realtimekit.settings.remove',
      targetType: 'workspace',
      targetId: WORKSPACE_ID,
    })
    return { realtimekit: realtimekitSettingsAdminDto(await loadRealtimeKitConfig(env)) }
  }

  const existing = (await db.select().from(realtimekitSettings).where(eq(realtimekitSettings.id, 'main')).limit(1))[0]
  const plainToken = body.apiToken?.trim()
  if (!plainToken && !existing) fail(400, 'api_token_required', 'API token is required')
  if (!plainToken && existing && !current.secretReadable) fail(400, 'api_token_required', 'Replace the API token after changing AUTH_SECRET')

  const encrypted = plainToken
    ? await encryptSecret(authSecret(env, getRequestURL(event).origin), REALTIMEKIT_SECRET_SCOPE, plainToken)
    : null
  const timestamp = nowIso()
  await db.insert(realtimekitSettings).values({
    id: 'main',
    accountId: body.accountId,
    appId: body.appId,
    apiTokenCiphertext: encrypted?.ciphertext ?? existing!.apiTokenCiphertext,
    apiTokenIv: encrypted?.iv ?? existing!.apiTokenIv,
    apiTokenVersion: encrypted?.version ?? existing!.apiTokenVersion,
    voicePreset: body.voicePreset,
    avPreset: body.avPreset,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }).onConflictDoUpdate({
    target: realtimekitSettings.id,
    set: {
      accountId: body.accountId,
      appId: body.appId,
      apiTokenCiphertext: encrypted?.ciphertext ?? existing!.apiTokenCiphertext,
      apiTokenIv: encrypted?.iv ?? existing!.apiTokenIv,
      apiTokenVersion: encrypted?.version ?? existing!.apiTokenVersion,
      voicePreset: body.voicePreset,
      avPreset: body.avPreset,
      updatedAt: timestamp,
    },
  })

  await writeAudit(env, {
    workspaceId: WORKSPACE_ID,
    actorId: member.user.id,
    action: 'realtimekit.settings.update',
    targetType: 'workspace',
    targetId: WORKSPACE_ID,
    meta: {
      token: plainToken ? (existing ? 'updated' : 'configured') : 'unchanged',
      voicePreset: body.voicePreset,
      avPreset: body.avPreset,
    },
  })
  return { realtimekit: realtimekitSettingsAdminDto(await loadRealtimeKitConfig(env)) }
})
