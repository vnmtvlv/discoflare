import { z } from 'zod'
import { WORKSPACE_ID } from '../../../../../shared/ids'
import {
  loadRealtimeKitConfig,
  realtimekitConfigured,
  testRealtimeKitConnection,
  type RealtimeKitConnectionTestResult,
  type RealtimeKitRuntimeConfig,
} from '../../../../../workers/realtimekit'
import { cf, fail } from '../../../../utils/cf'
import { requireMember } from '../../../../utils/guards'
import { writeAudit } from '../../../../utils/messages'
import { parseBody } from '../../../../utils/validate'

const bodySchema = z.object({
  accountId: z.string().trim().regex(/^[a-f0-9]{32}$/iu).optional(),
  appId: z.string().trim().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu).optional(),
  apiToken: z.string().max(4000).optional(),
  voicePreset: z.string().trim().min(1).max(100).optional(),
  avPreset: z.string().trim().min(1).max(100).optional(),
})

export default defineEventHandler(async (event): Promise<RealtimeKitConnectionTestResult & { ok: true }> => {
  setHeader(event, 'Cache-Control', 'no-store, max-age=0')
  const workspaceId = getRouterParam(event, 'id')!
  const member = await requireMember(event, workspaceId)
  if (!member.isOwner) fail(403, 'forbidden', 'Only the owner can test RealtimeKit')
  const body = parseBody(bodySchema, await readBody(event))
  const { env } = cf(event)
  const saved = await loadRealtimeKitConfig(env)
  const config: RealtimeKitRuntimeConfig = saved.source === 'deployment'
    ? saved
    : {
        accountId: body.accountId || saved.accountId,
        appId: body.appId || saved.appId,
        apiKey: body.apiToken?.trim() || saved.apiKey,
        apiSecret: '',
        voicePreset: body.voicePreset || saved.voicePreset,
        avPreset: body.avPreset || saved.avPreset,
        source: saved.source,
        apiTokenConfigured: Boolean(body.apiToken?.trim() || saved.apiTokenConfigured),
        secretReadable: saved.secretReadable,
      }
  if (!realtimekitConfigured(config)) {
    fail(400, 'realtimekit_unconfigured', 'Complete the RealtimeKit credentials first')
  }

  let result: RealtimeKitConnectionTestResult
  try {
    result = await testRealtimeKitConnection(config)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'RealtimeKit connection failed'
    if (message.startsWith('RealtimeKit preset not found:')) {
      fail(400, 'preset_not_found', message)
    }
    if (/RealtimeKit HTTP (401|403)/u.test(message)) {
      fail(400, 'invalid_credentials', 'RealtimeKit rejected the API token or account')
    }
    if (/RealtimeKit HTTP 404/u.test(message)) {
      fail(400, 'app_not_found', 'RealtimeKit app not found')
    }
    fail(502, 'realtimekit_connection_failed', message)
  }

  await writeAudit(env, {
    workspaceId: WORKSPACE_ID,
    actorId: member.user.id,
    action: 'realtimekit.connection.test',
    targetType: 'workspace',
    targetId: WORKSPACE_ID,
    meta: {
      source: config.source,
      voicePreset: config.voicePreset,
      avPreset: config.avPreset,
    },
  })
  return { ok: true, ...result }
})
