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

function httpUrl(value: string | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  }
  catch {
    return null
  }
}

function mailGatewayFetcher(env: DiscoflareEnv): { fetch: (request: Request) => Promise<Response> } | null {
  const gateway = env.MAIL_GATEWAY
  if (gateway && typeof gateway === 'object' && typeof gateway.fetch === 'function') return gateway
  return null
}

/** Service-binding URL, then `MAIL_GATEWAY_URL`, then a string `MAIL_GATEWAY`. */
export function mailGatewayHttpUrl(env: DiscoflareEnv): string | null {
  return httpUrl(env.MAIL_GATEWAY_URL) || httpUrl(typeof env.MAIL_GATEWAY === 'string' ? env.MAIL_GATEWAY : undefined)
}

export function smtpGatewayHttpUrl(env: DiscoflareEnv): string | null {
  return httpUrl(env.SMTP_GATEWAY_URL)
}

export function workspaceEmailAvailable(env: DiscoflareEnv): boolean {
  if (env.MAIL_EMAIL) return true
  if (mailGatewayFetcher(env) && env.MAIL_GATEWAY_TOKEN) return true
  if (mailGatewayHttpUrl(env) && env.MAIL_GATEWAY_TOKEN) return true
  if (smtpGatewayHttpUrl(env) && env.SMTP_GATEWAY_TOKEN) return true
  return false
}

export function authEmailAvailable(env: DiscoflareEnv): boolean {
  return Boolean(env.EMAIL || workspaceEmailAvailable(env))
}

async function postJsonGateway(url: string, token: string, message: WorkspaceEmailMessage, label: string): Promise<{ messageId: string }> {
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    })
  }
  catch {
    throw new Error(`${label} did not respond`)
  }
  const payload = await response.json().catch(() => null) as MailGatewayResponse | null
  if (!response.ok || !payload?.messageId) {
    throw new Error(payload?.error || `${label} rejected the message (${response.status})`)
  }
  return { messageId: payload.messageId }
}

export async function sendWorkspaceEmail(env: DiscoflareEnv, message: WorkspaceEmailMessage): Promise<{ messageId: string }> {
  const fetcher = mailGatewayFetcher(env)
  if (fetcher && env.MAIL_GATEWAY_TOKEN) {
    const response = await fetcher.fetch(new Request('https://discoflare-primary.internal/.discoflare/mail/send', {
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
  const gatewayUrl = mailGatewayHttpUrl(env)
  if (gatewayUrl && env.MAIL_GATEWAY_TOKEN) {
    return postJsonGateway(gatewayUrl, env.MAIL_GATEWAY_TOKEN, message, 'Mail gateway')
  }
  const smtpUrl = smtpGatewayHttpUrl(env)
  if (smtpUrl && env.SMTP_GATEWAY_TOKEN) {
    return postJsonGateway(smtpUrl, env.SMTP_GATEWAY_TOKEN, message, 'SMTP gateway')
  }
  if (env.MAIL_EMAIL) return env.MAIL_EMAIL.send(message)
  throw new Error('Workspace email sending is not configured')
}

export async function sendAuthEmail(env: DiscoflareEnv, message: WorkspaceEmailMessage): Promise<{ messageId: string }> {
  if (env.EMAIL) return env.EMAIL.send(message)
  return sendWorkspaceEmail(env, message)
}
