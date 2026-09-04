import '#nitro-internal-pollyfills'
import { useNitroApp } from 'nitropack/runtime'
import { isPublicAssetURL } from '#nitro-internal-virtual/public-assets'
import type { DiscoflareEnv } from '../workers/env'

export { ChannelDurableObject } from '../workers/channel-do'
export { WorkspaceDurableObject } from '../workers/workspace-do'
export { RateLimitDurableObject } from '../workers/rate-limit-do'
export { NotificationDurableObject } from '../workers/notification-do'
export { DiscoflareAgent, DiscoflareThink } from '../workers/discoflare-agent'
export { AgentTaskWorkflow } from '../workers/agent-task-workflow'
export { Sandbox } from '@cloudflare/sandbox'

const nitroApp = useNitroApp()

export default {
  async fetch(request: Request, env: DiscoflareEnv, context: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    if (request.headers.get('Upgrade') === 'websocket') {
      const channel = url.pathname.match(/^\/ws\/channel\/([^/]+)/)
      if (channel?.[1]) {
        return env.CHANNEL_DO.getByName(`channel:${channel[1]}`).fetch(request)
      }
      const workspace = url.pathname.match(/^\/ws\/workspace\/([^/]+)/)
      if (workspace?.[1]) {
        return env.WORKSPACE_DO.getByName(`workspace:${workspace[1]}`).fetch(request)
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
