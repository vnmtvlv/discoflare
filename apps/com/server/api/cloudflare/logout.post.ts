import { CLOUDFLARE_REVOKE_URL, oauthConfig } from '../../utils/cloudflare-oauth'
import { assertInstallerMutation } from '../../utils/installer-security'
import { useInstallerSession } from '../../utils/installer-session'

export default defineEventHandler(async (event) => {
  assertInstallerMutation(event)
  const session = await useInstallerSession(event)
  const token = session.data.cloudflare?.accessToken
  if (token) {
    const config = oauthConfig(event)
    const body = new URLSearchParams({ token })
    body.set('client_id', config.clientId)
    await fetch(CLOUDFLARE_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }).catch(() => undefined)
  }
  await session.update({ cloudflare: undefined, oauthPending: undefined })
  return { ok: true }
})
