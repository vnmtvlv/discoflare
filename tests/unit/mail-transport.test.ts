import { describe, expect, it, vi } from 'vitest'
import { receiveMailGatewayRequest, secureTokenEqual } from '../../workers/mail-gateway-ingress'
import { authEmailAvailable, sendAuthEmail, sendWorkspaceEmail, workspaceEmailAvailable } from '../../workers/mail-transport'

const message = {
  from: { email: 'support@dev1.example.com', name: 'Support' },
  to: ['person@example.net'],
  subject: 'Hello',
  text: 'World',
}

describe('workspace mail transport', () => {
  it('uses the authenticated gateway before a direct send binding', async () => {
    const direct = { send: vi.fn() }
    const fetch = vi.fn(async (request: Request) => {
      expect(request.url).toBe('https://discoflare-primary.internal/.discoflare/mail/send')
      expect(request.headers.get('Authorization')).toBe('Bearer workspace-token')
      expect(await request.json()).toEqual(message)
      return Response.json({ messageId: 'gateway-message' })
    })
    const env = { MAIL_GATEWAY: { fetch }, MAIL_GATEWAY_TOKEN: 'workspace-token', MAIL_EMAIL: direct } as never

    await expect(sendWorkspaceEmail(env, message)).resolves.toEqual({ messageId: 'gateway-message' })
    expect(direct.send).not.toHaveBeenCalled()
    expect(workspaceEmailAvailable(env)).toBe(true)
  })

  it('retains the direct binding adapter for manual deployments', async () => {
    const send = vi.fn(async () => ({ messageId: 'direct-message' }))
    await expect(sendWorkspaceEmail({ MAIL_EMAIL: { send } } as never, message)).resolves.toEqual({ messageId: 'direct-message' })
    expect(send).toHaveBeenCalledWith(message)
  })

  it('uses a dedicated auth binding before workspace mail', async () => {
    const authSend = vi.fn(async () => ({ messageId: 'auth-message' }))
    const workspaceSend = vi.fn()
    const env = { EMAIL: { send: authSend }, MAIL_EMAIL: { send: workspaceSend } } as never
    await expect(sendAuthEmail(env, message)).resolves.toEqual({ messageId: 'auth-message' })
    expect(workspaceSend).not.toHaveBeenCalled()
    expect(authEmailAvailable(env)).toBe(true)
  })

  it('surfaces a bounded gateway error', async () => {
    const env = {
      MAIL_GATEWAY_TOKEN: 'workspace-token',
      MAIL_GATEWAY: { fetch: async () => Response.json({ error: 'Sender domain is not registered' }, { status: 403 }) },
    } as never
    await expect(sendWorkspaceEmail(env, message)).rejects.toThrow('Sender domain is not registered')
  })
})

describe('primary mail ingress', () => {
  it('compares ingress credentials without comparing their raw values', async () => {
    await expect(secureTokenEqual('same', 'same')).resolves.toBe(true)
    await expect(secureTokenEqual('same', 'different')).resolves.toBe(false)
  })

  it('rejects public requests without the workspace credential', async () => {
    const request = new Request('https://workspace.example.com/.discoflare/mail/inbound', { method: 'POST', body: 'mail' })
    const response = await receiveMailGatewayRequest(request, { MAIL_GATEWAY_TOKEN: 'secret' } as never)
    expect(response.status).toBe(401)
  })

  it('lets the workspace D1 reject an unknown routed mailbox', async () => {
    const first = vi.fn(async () => null)
    const env = {
      MAIL_GATEWAY_TOKEN: 'secret',
      DB: { prepare: () => ({ bind: () => ({ first }) }) },
    } as never
    const request = new Request('https://workspace.example.com/.discoflare/mail/inbound', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer secret',
        'X-Discoflare-Mail-From': 'sender@example.net',
        'X-Discoflare-Mail-To': 'missing@workspace.example.com',
      },
      body: 'mail',
    })
    const response = await receiveMailGatewayRequest(request, env)
    expect(response.status).toBe(404)
    await expect(response.text()).resolves.toBe('Unknown Discoflare mailbox')
  })
})
