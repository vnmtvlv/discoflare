import { requireChannelAccess } from '../../../utils/guards'
import { cf } from '../../../utils/cf'
import { fanoutDm } from '../../../utils/dms'

export default defineEventHandler(async (event) => {
  const channelId = getRouterParam(event, 'channelId')!
  const access = await requireChannelAccess(event, channelId)
  const { env } = cf(event)
  try {
    const stub = asRpc<{
      getHuddle: () => Promise<{ active: boolean; participantIds: string[] }>
      fanout: (msg: unknown) => Promise<void>
    }>(env.CHANNEL_DO.getByName(`channel:${channelId}`))
    const huddle = await stub.getHuddle()
    huddle.participantIds = huddle.participantIds.filter((id) => id !== access.user.id)
    await stub.fanout({ t: 'huddle', huddle })
    await stub.fanout({ t: 'voice', voice: huddle })
  }
  catch {
    await fanoutDm(env, channelId, { t: 'huddle.leave' })
  }
  return { ok: true }
})
