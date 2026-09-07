import type { DiscoflareEnv } from './env'
import { ChannelDurableObject } from './channel-do'
import { WorkspaceDurableObject } from './workspace-do'
import { RateLimitDurableObject } from './rate-limit-do'
import { NotificationDurableObject } from './notification-do'
import { DiscoflareAgent, DiscoflareThink } from './discoflare-agent'
import { WorkspaceProxy } from './agent-computer'
import { AgentTaskWorkflow } from './agent-task-workflow'
import { receiveMailGatewayRequest } from './mail-gateway-ingress'
import { receivePrimaryMailSend, routeWorkspaceEmail } from './primary-mail-router'

export { ChannelDurableObject, WorkspaceDurableObject, RateLimitDurableObject, NotificationDurableObject, DiscoflareAgent, DiscoflareThink, AgentTaskWorkflow, WorkspaceProxy }

export default {
  async fetch(request: Request, env: DiscoflareEnv): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/.discoflare/mail/inbound') return receiveMailGatewayRequest(request, env)
    if (url.pathname === '/.discoflare/mail/send') return receivePrimaryMailSend(request, env)
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
    await routeWorkspaceEmail(message, env)
  },
}
