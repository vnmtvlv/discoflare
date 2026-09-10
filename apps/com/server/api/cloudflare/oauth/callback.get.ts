import { CLOUDFLARE_TOKEN_URL, oauthConfig } from '../../../utils/cloudflare-oauth'
import { useInstallerSession } from '../../../utils/installer-session'

type TokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
}

function returnWithError(returnTo: string, error: string) {
  const url = new URL(returnTo, 'https://discoflare.invalid')
  url.searchParams.set('error', error)
  return `${url.pathname}${url.search}`
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const session = await useInstallerSession(event)
  const pending = session.data.oauthPending
  const returnTo = pending?.returnTo || '/deploy'

  if (query.error) {
    await session.update({ cloudflare: undefined, oauthPending: undefined })
    return sendRedirect(event, returnWithError(returnTo, String(query.error)))
  }

  if (!pending || typeof query.code !== 'string' || query.state !== pending.state) {
    await session.update({ cloudflare: undefined, oauthPending: undefined })
    return sendRedirect(event, returnWithError(returnTo, 'oauth_state'))
  }

  const config = oauthConfig(event)
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: query.code,
    redirect_uri: config.redirectUri,
    code_verifier: pending.verifier,
  })
  body.set('client_id', config.clientId)
  const response = await fetch(CLOUDFLARE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) {
    await session.update({ cloudflare: undefined, oauthPending: undefined })
    return sendRedirect(event, returnWithError(returnTo, 'oauth_exchange'))
  }

  const token = await response.json() as TokenResponse
  if (!token.access_token) {
    await session.update({ cloudflare: undefined, oauthPending: undefined })
    return sendRedirect(event, returnWithError(returnTo, 'oauth_token'))
  }
  if (pending.mode === 'managed' && !token.refresh_token) {
    await session.update({ cloudflare: undefined, oauthPending: undefined })
    return sendRedirect(event, returnWithError(returnTo, 'oauth_refresh_token'))
  }
  await session.update({
    oauthPending: undefined,
    cloudflare: {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + Math.max(60, (token.expires_in || 3600) - 30) * 1000,
      mode: pending.mode,
      ...(pending.adminLogin ? { adminLogin: pending.adminLogin } : {}),
    },
  })
  return sendRedirect(event, returnTo)
})
