import { destroySession } from '../../utils/auth'
import { authFromEvent } from '../../utils/better-auth'

export default defineEventHandler(async (event) => {
  try {
    await authFromEvent(event).api.signOut({ headers: event.headers })
  }
  catch {
    // still clear legacy cookie
  }
  await destroySession(event)
  return { ok: true }
})
