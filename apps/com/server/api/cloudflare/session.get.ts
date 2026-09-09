import type { CloudflareAccount, CloudflareZone, InstallerSessionResponse } from '../../../shared/installer'
import { cloudflareClient } from '@discoflare/installer-core'
import { useInstallerSession } from '../../utils/installer-session'

export default defineEventHandler(async (event): Promise<InstallerSessionResponse> => {
  const session = await useInstallerSession(event)
  const authorized = session.data.cloudflare
  if (!authorized || authorized.expiresAt <= Date.now()) {
    if (authorized) await session.update({ cloudflare: undefined })
    return { connected: false, accounts: [], zones: [], managedAdmins: session.data.managedAdmins || [] }
  }

  try {
    const client = cloudflareClient(authorized.accessToken)
    const accounts: CloudflareAccount[] = []
    for await (const account of client.accounts.list({ per_page: 50 })) {
      accounts.push({ id: account.id, name: account.name, type: account.type })
    }
    const zones: CloudflareZone[] = []
    for await (const zone of client.zones.list({ per_page: 50 })) {
      if (!zone.id || !zone.name || !zone.account?.id) continue
      zones.push({ id: zone.id, name: zone.name, accountId: zone.account.id, status: zone.status || 'unknown' })
    }
    return { connected: true, accounts, zones, managedAdmins: session.data.managedAdmins || [] }
  }
  catch {
    await session.update({ cloudflare: undefined })
    return { connected: false, accounts: [], zones: [], managedAdmins: session.data.managedAdmins || [] }
  }
})
