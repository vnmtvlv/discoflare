import type { DiscoflareEnv } from './env'
import { ChannelDurableObject } from './channel-do'
import { WorkspaceDurableObject } from './workspace-do'
import { RateLimitDurableObject } from './rate-limit-do'
import { NotificationDurableObject } from './notification-do'
import { DiscoflareAgent, DiscoflareThink } from './discoflare-agent'
import { AgentTaskWorkflow } from './agent-task-workflow'
import { Sandbox } from '@cloudflare/sandbox'
import { receiveWorkspaceEmail } from './mail-ingress'

export { ChannelDurableObject, WorkspaceDurableObject, RateLimitDurableObject, NotificationDurableObject, DiscoflareAgent, DiscoflareThink, AgentTaskWorkflow, Sandbox }

export default {
  async fetch(request: Request, env: DiscoflareEnv): Promise<Response> {
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
    return new Response('discoflare durable objects', { status: 200 })
  },
  async email(message: ForwardableEmailMessage, env: DiscoflareEnv): Promise<void> {
    await receiveWorkspaceEmail(message, env)
  },
}
