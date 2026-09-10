import { clearAdminSession } from '../../utils/admin-session'
import { assertAdminMutation } from '../../utils/security'

export default defineEventHandler(async (event) => {
  assertAdminMutation(event)
  await clearAdminSession(event)
  return { authenticated: false }
})
