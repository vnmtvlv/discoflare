import { authFromEvent } from '../../utils/better-auth'

export default defineEventHandler(async (event) => {
  const path = event.path.split('?')[0]?.replace(/\/+$/, '')
  if (path === '/api/auth/sign-up/email'
    || path === '/api/auth/sign-in/email'
    || path === '/api/auth/sign-in/social'
    || path === '/api/auth/request-password-reset'
    || path === '/api/auth/link-social'
    || path === '/api/auth/unlink-account'
    || path === '/api/auth/change-email'
    || path === '/api/auth/set-password') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  const auth = await authFromEvent(event)
  return auth.handler(toWebRequest(event))
})
