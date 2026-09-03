import type { DiscoflareEnv } from './env'
import { ChannelDurableObject } from './channel-do'
import { GuildDurableObject } from './guild-do'
import { RateLimitDurableObject } from './rate-limit-do'

export { ChannelDurableObject, GuildDurableObject, RateLimitDurableObject }

export default {
  async fetch(request: Request, env: DiscoflareEnv): Promise<Response> {
    const url = new URL(request.url)
    if (request.headers.get('Upgrade') === 'websocket') {
      const channel = url.pathname.match(/^\/ws\/channel\/([^/]+)/)
      if (channel?.[1]) {
        return env.CHANNEL_DO.getByName(`channel:${channel[1]}`).fetch(request)
      }
      const guild = url.pathname.match(/^\/ws\/guild\/([^/]+)/)
      if (guild?.[1]) {
        return env.GUILD_DO.getByName(`guild:${guild[1]}`).fetch(request)
      }
    }
    return new Response('discoflare durable objects', { status: 200 })
  },
}
