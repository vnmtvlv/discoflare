import { requireChannelAccess } from '../../../utils/guards'
import { cf, fail } from '../../../utils/cf'
import { addParticipant, loadRealtimeKitConfig, realtimekitConfigured } from '../../../../workers/realtimekit'
import type { HuddleState } from '../../../../shared/types'

export default defineEventHandler(async (event) => {
  const channelId = getRouterParam(event, 'channelId')!
  const member = await requireChannelAccess(event, channelId)
  const { env } = cf(event)
  const realtimekit = await loadRealtimeKitConfig(env)
  if (!realtimekitConfigured(realtimekit)) fail(501, 'realtimekit_unconfigured', 'RealtimeKit credentials missing')

  const stub = asRpc<{
    getHuddle: () => Promise<HuddleState>
  }>(env.CHANNEL_DO.getByName(`channel:${channelId}`))
  const huddle = await stub.getHuddle()
  if (!huddle.active || !huddle.meetingId) fail(404, 'not_found', 'No active live session')
  const meetingId = huddle.meetingId
  if (!meetingId) fail(404, 'not_found', 'No active live session')

  const { token } = await addParticipant(realtimekit, meetingId, {
    name: member.user.displayName,
    customId: member.user.id,
    preset: realtimekit.avPreset,
  })
  return { token, meetingId, huddle }
})
