import type { H3Event, SessionConfig } from 'h3'
import { installerConfig } from './installer-config'

type InstallerSessionData = {
  oauthPending?: {
    state: string
    verifier: string
    returnTo: string
    mode: 'managed' | 'private'
  }
  cloudflare?: {
    accessToken: string
    refreshToken?: string
    expiresAt: number
    mode: 'managed' | 'private'
  }
  managedAdmins?: Array<{
    accountId: string
    accountName: string
    origin: string
    workerName: string
    version: string
  }>
}

function sessionConfig(event: H3Event): SessionConfig {
  const config = installerConfig(event)
  const password = config.installerSessionPassword
  if (typeof password !== 'string' || password.length < 32) {
    throw createError({ statusCode: 503, statusMessage: 'Cloudflare installer is not configured' })
  }

  return {
    name: 'discoflare-installer',
    password,
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

export function useInstallerSession(event: H3Event) {
  return useSession<InstallerSessionData>(event, sessionConfig(event))
}

export async function requireCloudflareToken(event: H3Event) {
  const session = await useInstallerSession(event)
  const cloudflare = session.data.cloudflare
  if (!cloudflare || cloudflare.expiresAt <= Date.now()) {
    await session.update({ cloudflare: undefined, oauthPending: undefined })
    throw createError({ statusCode: 401, statusMessage: 'Connect Cloudflare again' })
  }
  return cloudflare.accessToken
}

export async function requireManagedCloudflareToken(event: H3Event) {
  const session = await useInstallerSession(event)
  const cloudflare = session.data.cloudflare
  if (!cloudflare || cloudflare.expiresAt <= Date.now() || cloudflare.mode !== 'managed') {
    await session.update({ cloudflare: undefined })
    throw createError({ statusCode: 401, statusMessage: 'Connect Cloudflare with the managed installer' })
  }
  return cloudflare.accessToken
}

export async function requireManagedCloudflareCredential(event: H3Event) {
  const session = await useInstallerSession(event)
  const cloudflare = session.data.cloudflare
  if (!cloudflare || cloudflare.expiresAt <= Date.now() || cloudflare.mode !== 'managed' || !cloudflare.refreshToken) {
    await session.update({ cloudflare: undefined })
    throw createError({ statusCode: 401, statusMessage: 'Connect Cloudflare with the managed installer' })
  }
  return { ...cloudflare, refreshToken: cloudflare.refreshToken }
}
