import { cf, fail } from '../../../utils/cf'

export default defineEventHandler(async (event) => {
  const { env, request } = cf(event)
  const guildId = getRouterParam(event, 'guildId')!
  if (!request || getHeader(event, 'upgrade') !== 'websocket') {
    fail(426, 'upgrade_required', 'Expected WebSocket')
  }
  return env.GUILD_DO.getByName(`guild:${guildId}`).fetch(request)
})
