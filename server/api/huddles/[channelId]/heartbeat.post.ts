import { requireChannelAccess } from '../../../utils/guards'
import { cf } from '../../../utils/cf'

export default defineEventHandler(async (event) => {
  const channelId = getRouterParam(event, 'channelId')!
  const member = await requireChannelAccess(event, channelId)
  const { env } = cf(event)
  const stub = asRpc<{ pingHuddle: (userId: string) => Promise<void> }>(env.CHANNEL_DO.getByName(`channel:${channelId}`))
  await stub.pingHuddle(member.user.id)
  return { ok: true }
})
