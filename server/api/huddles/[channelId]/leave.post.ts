import { requireChannelAccess } from '../../../utils/guards'
import { cf } from '../../../utils/cf'

export default defineEventHandler(async (event) => {
  const channelId = getRouterParam(event, 'channelId')!
  const access = await requireChannelAccess(event, channelId)
  const { env } = cf(event)
  const stub = asRpc<{
    leaveHuddle: (userId: string) => Promise<unknown>
  }>(env.CHANNEL_DO.getByName(`channel:${channelId}`))
  await stub.leaveHuddle(access.user.id)
  return { ok: true }
})
