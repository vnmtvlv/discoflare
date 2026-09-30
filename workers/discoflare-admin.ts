import type { DiscoflareEnv } from './env'
import type { InstallationDomainSettingsDTO } from '../shared/releases'

/**
 * What this workspace may ask of its account's Discoflare Admin over the
 * `DISCOFLARE_ADMIN` service binding. The Admin identifies the caller from the
 * binding itself, so no method takes a workspace name.
 */
export type DiscoflareAdmin = {
  status: () => Promise<{ admin: { version: string | null, origin: string | null }, latestVersion: string | null, adminUpdateAvailable: boolean }>
  domains: () => Promise<Omit<InstallationDomainSettingsDTO, 'managed'>>
  connectAppDomain: (input: { zoneId: string, hostname: string }) => Promise<{ hostname: string }>
  disconnectAppDomain: () => Promise<{ hostname: string }>
  connectEmailDomain: (input: { zoneId: string, domain: string }) => Promise<{ id: string, domain: string, zoneId: string, zoneName: string, sendingEnabled?: boolean }>
  disconnectEmailDomain: (emailDomainId: string) => Promise<{ disconnected: boolean }>
  createMailboxRoute: (address: string) => Promise<unknown>
  deleteMailboxRoute: (address: string) => Promise<unknown>
  liveStatus: () => Promise<{ provisioned: boolean, appId: string | null }>
  liveCreateMeeting: (title: string) => Promise<{ id: string }>
  liveAddParticipant: (meetingId: string, seat: { name: string, customId: string, host: boolean }) => Promise<{ id: string, token: string }>
  liveRemoveParticipants: (meetingId: string, participantIds: string[]) => Promise<void>
  liveEndMeeting: (meetingId: string) => Promise<void>
}

export function discoflareAdmin(env: DiscoflareEnv): DiscoflareAdmin | null {
  return env.DISCOFLARE_ADMIN ? env.DISCOFLARE_ADMIN as unknown as DiscoflareAdmin : null
}

let cachedOrigin: string | null = null

/** Where the owner manages this workspace, or null when no Admin is linked. */
export async function discoflareAdminOrigin(env: DiscoflareEnv): Promise<string | null> {
  const admin = discoflareAdmin(env)
  if (!admin) return null
  if (cachedOrigin) return cachedOrigin
  try {
    cachedOrigin = (await admin.status()).admin.origin
  }
  catch {
    return null
  }
  return cachedOrigin
}

/** The Admin page for this workspace, where updates and deletion happen. */
export async function discoflareAdminWorkspaceUrl(env: DiscoflareEnv, hash?: Record<string, string>): Promise<string | null> {
  const origin = await discoflareAdminOrigin(env)
  const workerName = env.DISCOFLARE_WORKER_NAME?.trim()
  if (!origin || !workerName) return null
  const url = new URL(`/workspaces/${encodeURIComponent(workerName)}`, origin)
  if (hash) url.hash = new URLSearchParams(hash).toString()
  return url.toString()
}
