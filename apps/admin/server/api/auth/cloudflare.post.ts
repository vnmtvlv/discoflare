import { cloudflareClient } from '@discoflare/installer-core'
import { createAdminSession } from '../../utils/admin-session'
import { requireAdminConfig } from '../../utils/cloudflare'
import { assertAdminMutation } from '../../utils/security'

export default defineEventHandler(async (event) => {
  assertAdminMutation(event)
  const body = await readBody<{ accessToken?: unknown }>(event)
  const accessToken = typeof body?.accessToken === 'string' ? body.accessToken.trim() : ''
  if (!accessToken || accessToken.length > 4_000) throw createError({ statusCode: 400, statusMessage: 'Cloudflare login token is invalid' })

  const { accountId, email, userId } = requireAdminConfig(event)
  const client = cloudflareClient(accessToken)
  const user = await client.user.get()
  const actualEmail = user.email.trim().toLowerCase()
  if (actualEmail !== email || (userId && user.id !== userId)) {
    throw createError({ statusCode: 403, statusMessage: 'This Cloudflare identity is not the Discoflare Admin owner' })
  }
  let member = false
  for await (const membership of client.memberships.list()) {
    if (membership.status === 'accepted' && membership.account?.id === accountId) {
      member = true
      break
    }
  }
  if (!member) throw createError({ statusCode: 403, statusMessage: 'This Cloudflare identity no longer belongs to the Admin account' })

  await createAdminSession(event, { userId: user.id, email: actualEmail, accountId })
  return { authenticated: true }
})
