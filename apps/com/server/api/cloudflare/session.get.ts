import type { CloudflareAccount, CloudflareZone, InstallerSessionResponse } from '../../../shared/installer'
import { cloudflareClient } from '@discoflare/installer-core'
import { activeInstallHandoff, useInstallerSession } from '../../utils/installer-session'

export default defineEventHandler(async (event): Promise<InstallerSessionResponse> => {
  const session = await useInstallerSession(event)
  const stored = session.data
  const authorized = stored.cloudflare
  if (authorized && authorized.expiresAt <= Date.now()) {
    await session.update({ cloudflare: undefined })
  }

  if (stored.installHandoff?.expiresAt !== undefined && stored.installHandoff.expiresAt <= Date.now()) {
    await session.update({ installHandoff: undefined })
  }

  const profile = {
    managedAdmins: stored.managedAdmins || [],
    handoff: activeInstallHandoff(stored.installHandoff),
  }

  const credential = session.data.cloudflare
  if (!credential) return { connected: false, accounts: [], zones: [], ...profile }

  try {
    const client = cloudflareClient(credential.accessToken)
    const accounts: CloudflareAccount[] = []
    for await (const account of client.accounts.list({ per_page: 50 })) {
      accounts.push({ id: account.id, name: account.name, type: account.type })
    }
    const zones: CloudflareZone[] = []
    for await (const zone of client.zones.list({ per_page: 50 })) {
      if (!zone.id || !zone.name || !zone.account?.id) continue
      zones.push({ id: zone.id, name: zone.name, accountId: zone.account.id, status: zone.status || 'unknown' })
    }
    return { connected: true, accounts, zones, ...profile }
  }
  catch {
    await session.update({ cloudflare: undefined })
    return { connected: false, accounts: [], zones: [], ...profile }
  }
})
