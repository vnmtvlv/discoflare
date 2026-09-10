import type { H3Event, SessionConfig } from 'h3'
import { requireAdminConfig } from './cloudflare'

export type AdminIdentity = {
  userId: string
  email: string
  accountId: string
}

function sessionConfig(event: H3Event): SessionConfig {
  const { sessionSecret } = requireAdminConfig(event)
  return {
    name: 'discoflare-admin',
    password: sessionSecret,
    maxAge: 60 * 60 * 24 * 30,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: getRequestProtocol(event) === 'https',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    },
  }
}

export function useAdminSession(event: H3Event) {
  return useSession<AdminIdentity>(event, sessionConfig(event))
}

export async function adminSessionIdentity(event: H3Event) {
  const session = await useAdminSession(event)
  const { accountId, email, userId } = requireAdminConfig(event)
  const identity = session.data
  if (identity.accountId !== accountId || identity.email !== email) return null
  if (userId && identity.userId !== userId) return null
  return identity
}

export async function createAdminSession(event: H3Event, identity: AdminIdentity) {
  const session = await useAdminSession(event)
  await session.update(identity)
  return identity
}

export async function clearAdminSession(event: H3Event) {
  const session = await useAdminSession(event)
  await session.clear()
}
