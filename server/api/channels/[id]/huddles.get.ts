import { requireChannelAccess } from '../../../utils/guards'
import { cf } from '../../../utils/cf'
import { listScheduledHuddles } from '../../../utils/scheduled-huddles'

export default defineEventHandler(async (event) => {
  const channelId = getRouterParam(event, 'id')!
  await requireChannelAccess(event, channelId)
  const { env } = cf(event)
  const stub = asRpc<{ refreshScheduleAlarm: () => Promise<void> }>(env.CHANNEL_DO.getByName(`channel:${channelId}`))
  await stub.refreshScheduleAlarm()
  return { huddles: await listScheduledHuddles(env, channelId) }
})
