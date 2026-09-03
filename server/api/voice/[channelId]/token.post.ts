import { requireChannelAccess } from '../../../utils/guards'
import { cf, fail } from '../../../utils/cf'
import { addParticipant, realtimekitConfigured } from '../../../../workers/realtimekit'

export default defineEventHandler(async (event) => {
  const channelId = getRouterParam(event, 'channelId')!
  const member = await requireChannelAccess(event, channelId)
  const { env } = cf(event)
  if (!realtimekitConfigured(env)) fail(501, 'realtimekit_unconfigured', 'RealtimeKit secrets missing')

  const stub = asRpc<{
    getHuddle: () => Promise<{ active: boolean; meetingId: string | null }>
  }>(env.CHANNEL_DO.getByName(`channel:${channelId}`))
  const huddle = await stub.getHuddle()
  if (!huddle.active || !huddle.meetingId) fail(404, 'not_found', 'No active huddle')

  const av = getQuery(event).av === '1'
  const preset = av ? (env.REALTIMEKIT_PRESET_AV || env.REALTIMEKIT_PRESET_VOICE || 'voice') : (env.REALTIMEKIT_PRESET_VOICE || 'voice')
  const { token } = await addParticipant(env, huddle.meetingId, {
    name: member.user.displayName,
    customId: member.user.id,
    preset,
  })
  return { token, meetingId: huddle.meetingId }
})
