import { CLOUDFLARE_REVOKE_URL, oauthBasicAuth, oauthConfig } from '../../utils/cloudflare-oauth'
import { assertInstallerMutation } from '../../utils/installer-security'
import { useInstallerSession } from '../../utils/installer-session'

export default defineEventHandler(async (event) => {
  assertInstallerMutation(event)
  const session = await useInstallerSession(event)
  const token = session.data.cloudflare?.refreshToken || session.data.cloudflare?.accessToken
  if (token) {
    const config = oauthConfig(event, undefined, session.data.cloudflare?.mode || 'private')
    const body = new URLSearchParams({ token })
    if (config.publicClient) body.set('client_id', config.clientId)
    await fetch(CLOUDFLARE_REVOKE_URL, {
      method: 'POST',
      headers: {
        ...(config.publicClient ? {} : { Authorization: oauthBasicAuth(config.clientId, config.clientSecret) }),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    }).catch(() => undefined)
  }
  await session.update({ cloudflare: undefined, oauthPending: undefined })
  return { ok: true }
})
