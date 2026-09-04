import { authFromEvent } from '../../utils/better-auth'
import { fail } from '../../utils/cf'

export default defineEventHandler(async (event) => {
  const auth = await authFromEvent(event)
  const res = await auth.api.signOut({ headers: event.headers, asResponse: true })
  if (!res.ok) fail(500, 'auth_error', 'Could not sign out')
  for (const cookie of res.headers.getSetCookie?.() ?? []) appendResponseHeader(event, 'set-cookie', cookie)
  return { ok: true }
})
