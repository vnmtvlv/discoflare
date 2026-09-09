import { proxyAdminRealtimeKit, type AdminRealtimeRequest } from '@discoflare/installer-core'
import { requireAccountToken, requireAdminConfig } from '../../utils/cloudflare'

export default defineEventHandler(async (event): Promise<{ result: unknown }> => {
  const capability = getHeader(event, 'authorization')?.replace(/^Bearer\s+/iu, '').trim() || ''
  const request = await readBody<AdminRealtimeRequest>(event)
  const token = requireAccountToken(event)
  const { accountId } = requireAdminConfig(event)
  if (request.accountId !== accountId) throw createError({ statusCode: 403, statusMessage: 'Cloudflare account mismatch' })
  return { result: await proxyAdminRealtimeKit(token, capability, request) }
})
