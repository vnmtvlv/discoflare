import { adminInstallerMarker, cloudflareClient, discoflareAdminWorkerName } from '@discoflare/installer-core'
import { consumeAdminLoginCredential } from '../../utils/installer-session'

type Binding = { name?: string, type?: string, text?: string }

function bindingValue(bindings: Binding[], name: string) {
  return bindings.find(binding => binding.type === 'plain_text' && binding.name === name)?.text?.trim() || ''
}

export default defineEventHandler(async (event) => {
  const credential = await consumeAdminLoginCredential(event)
  const client = cloudflareClient(credential.accessToken)
  const user = await client.user.get()
  let member = false
  for await (const membership of client.memberships.list()) {
    if (membership.status === 'accepted' && membership.account?.id === credential.accountId) {
      member = true
      break
    }
  }
  if (!member) throw createError({ statusCode: 403, statusMessage: 'This Cloudflare user cannot access the Admin account' })
  const settings = await client.workers.scripts.scriptAndVersionSettings.get(discoflareAdminWorkerName, {
    account_id: credential.accountId,
  })
  const bindings = settings.bindings as Binding[] || []
  if (
    bindingValue(bindings, 'DISCOFLARE_ADMIN_INSTALLATION') !== adminInstallerMarker
    || bindingValue(bindings, 'DISCOFLARE_ADMIN_ACCOUNT_ID') !== credential.accountId
    || bindingValue(bindings, 'DISCOFLARE_ADMIN_ORIGIN') !== credential.origin
  ) {
    throw createError({ statusCode: 403, statusMessage: 'The Admin login destination could not be verified' })
  }
  return {
    origin: credential.origin,
    accountId: credential.accountId,
    accessToken: credential.accessToken,
    email: user.email.trim().toLowerCase(),
  }
})
