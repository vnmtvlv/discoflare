import '#nitro-internal-pollyfills'
import { useNitroApp } from 'nitropack/runtime'
import { isPublicAssetURL } from '#nitro-internal-virtual/public-assets'
import type { DiscoflareEnv } from '../workers/env'

export { ChannelDurableObject } from '../workers/channel-do'
export { GuildDurableObject } from '../workers/guild-do'
export { RateLimitDurableObject } from '../workers/rate-limit-do'

const nitroApp = useNitroApp()

export default {
  async fetch(request: Request, env: DiscoflareEnv, context: ExecutionContext): Promise<Response> {
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

    if (env.ASSETS && isPublicAssetURL(url.pathname)) {
      return env.ASSETS.fetch(request)
    }

    ;(globalThis as { __env__?: DiscoflareEnv }).__env__ = env

    let body: Buffer | undefined
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const ab = await request.arrayBuffer()
      if (ab.byteLength) body = Buffer.from(ab)
    }

    return nitroApp.localFetch(url.pathname + url.search, {
      context: {
        waitUntil: (p: Promise<unknown>) => context.waitUntil(p),
        _platform: {
          cf: request.cf,
          cloudflare: { request, env, context, url },
        },
      },
      host: url.hostname,
      protocol: url.protocol,
      method: request.method,
      headers: request.headers,
      body,
    } as Parameters<typeof nitroApp.localFetch>[1])
  },
}
