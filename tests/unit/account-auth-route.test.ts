import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const { context, response } = vi.hoisted(() => ({ context: vi.fn(), response: vi.fn() }))
vi.mock('../../server/utils/account-auth', () => ({ accountAuthContext: context, accountAuthResponse: response }))
let handle: (event: never) => Promise<unknown>
let body: object
let value: { env: object, config: { email: { verificationReady: boolean } }, session: { user: { id: string, email: string, emailVerified: boolean }, session: { createdAt: Date } }, email: string | null, methods: Record<string, boolean>, usableProviders: string[], auth: { api: { setPassword: ReturnType<typeof vi.fn> } } }

beforeEach(async () => {
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('readBody', () => body)
  vi.stubGlobal('createError', (options: object) => Object.assign(new Error((options as { statusMessage: string }).statusMessage), options))
  body = { action: 'password', password: 'new-password' }
  value = { env: {}, config: { email: { verificationReady: true } }, session: { user: { id: 'member', email: 'member@example.test', emailVerified: true }, session: { createdAt: new Date() } }, email: 'member@example.test', methods: { email: true }, usableProviders: ['credential'], auth: { api: { setPassword: vi.fn().mockResolvedValue(new Response('{}')) } } }
  context.mockResolvedValue(value)
  response.mockResolvedValue({ status: true })
  handle = (await import('../../server/api/auth/account.post')).default as typeof handle
})
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals() })

const event = { headers: new Headers() } as never

describe('member account mutation protection', () => {
  it('requires a verified real email before setting a password', async () => {
    value.email = null
    await expect(handle(event)).rejects.toMatchObject({ statusCode: 403 })
    value.email = 'member@example.test'; value.session.user.emailVerified = false
    await expect(handle(event)).rejects.toMatchObject({ statusCode: 403 })
    expect(value.auth.api.setPassword).not.toHaveBeenCalled()
  })
  it('does not bypass the owner email-login switch', async () => {
    value.methods.email = false
    await expect(handle(event)).rejects.toMatchObject({ statusCode: 403 })
    expect(value.auth.api.setPassword).not.toHaveBeenCalled()
  })
  it('rejects stale sessions before changing credentials', async () => {
    value.session.session.createdAt = new Date(Date.now() - 16 * 60 * 1000)
    await expect(handle(event)).rejects.toMatchObject({ statusCode: 403 })
    expect(value.auth.api.setPassword).not.toHaveBeenCalled()
  })
  it('uses the current account and prevents a disabled provider connection', async () => {
    body = { action: 'link', provider: 'google' }
    await expect(handle(event)).rejects.toMatchObject({ statusCode: 403 })
    expect(value.auth.api.setPassword).not.toHaveBeenCalled()
  })
  it('sets the initial password only after verification', async () => {
    await expect(handle(event)).resolves.toEqual({ status: true })
    expect(value.auth.api.setPassword).toHaveBeenCalledWith(expect.objectContaining({ body: { newPassword: 'new-password' } }))
  })
})
