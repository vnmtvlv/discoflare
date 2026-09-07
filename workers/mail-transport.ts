import type { DiscoflareEnv } from './env'

export type WorkspaceEmailAddress = string | { email: string, name: string }

export type WorkspaceEmailMessage = {
  from: WorkspaceEmailAddress
  to: WorkspaceEmailAddress | WorkspaceEmailAddress[]
  cc?: WorkspaceEmailAddress | WorkspaceEmailAddress[]
  bcc?: WorkspaceEmailAddress | WorkspaceEmailAddress[]
  replyTo?: WorkspaceEmailAddress
  subject: string
  text?: string
  html?: string
  headers?: Record<string, string>
}

type MailGatewayResponse = {
  messageId?: string
  error?: string
}

export function workspaceEmailAvailable(env: DiscoflareEnv): boolean {
  return Boolean(env.MAIL_EMAIL || (env.MAIL_GATEWAY && env.MAIL_GATEWAY_TOKEN))
}

export function authEmailAvailable(env: DiscoflareEnv): boolean {
  return Boolean(env.EMAIL || workspaceEmailAvailable(env))
}

export async function sendWorkspaceEmail(env: DiscoflareEnv, message: WorkspaceEmailMessage): Promise<{ messageId: string }> {
  if (env.MAIL_GATEWAY && env.MAIL_GATEWAY_TOKEN) {
    const response = await env.MAIL_GATEWAY.fetch(new Request('https://discoflare-primary.internal/.discoflare/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.MAIL_GATEWAY_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    }))
    const payload = await response.json().catch(() => null) as MailGatewayResponse | null
    if (!response.ok || !payload?.messageId) {
      throw new Error(payload?.error || `Primary workspace mail rejected the message (${response.status})`)
    }
    return { messageId: payload.messageId }
  }
  if (env.MAIL_EMAIL) return env.MAIL_EMAIL.send(message)
  throw new Error('Workspace email sending is not bound')
}

export async function sendAuthEmail(env: DiscoflareEnv, message: WorkspaceEmailMessage): Promise<{ messageId: string }> {
  if (env.EMAIL) return env.EMAIL.send(message)
  return sendWorkspaceEmail(env, message)
}
