import { requireAdminConfig } from '../../utils/cloudflare'

export default defineEventHandler((event) => {
  const { accountId, loginOrigin, origin } = requireAdminConfig(event)
  const url = new URL('/api/cloudflare/oauth/start', loginOrigin)
  url.searchParams.set('adminOrigin', origin)
  url.searchParams.set('accountId', accountId)
  return { url: url.toString() }
})
