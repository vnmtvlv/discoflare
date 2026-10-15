import { requireUser } from '../../utils/auth'
import { accountAuthContext, accountAuthSettings } from '../../utils/account-auth'
import { cf } from '../../utils/cf'
import { authMode } from '../../utils/cloudflare-access'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  await requireUser(event)
  if (authMode(cf(event).env) === 'access') return { providers: [], managed: true, email: null, emailVerified: false, canAddEmail: false, canSetPassword: false, methods: {}, accounts: [] }
  const context = await accountAuthContext(event)
  return { providers: [...new Set(context.accounts.map(account => account.providerId))], ...accountAuthSettings(context) }
})
