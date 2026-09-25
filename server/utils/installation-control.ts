import type { DiscoflareEnv } from '../../workers/env'

const DEFAULT_CONTROL_ENDPOINT = 'https://discoflare.com/api/installation-control'

function controlConfig(env: DiscoflareEnv) {
  const installationId = env.DISCOFLARE_CONTROL_ID?.trim()
  const token = env.DISCOFLARE_CONTROL_TOKEN?.trim()
  if (!installationId || !token) return null
  return {
    installationId,
    token,
    endpoint: (env.DISCOFLARE_CONTROL_ENDPOINT?.trim() || DEFAULT_CONTROL_ENDPOINT).replace(/\/$/u, ''),
  }
}

async function controlRequest(env: DiscoflareEnv, method: 'POST' | 'DELETE', address: string) {
  const config = controlConfig(env)
  if (!config) return { managed: false as const }
  const response = await fetch(`${config.endpoint}/installations/${encodeURIComponent(config.installationId)}/mailbox-routes`, {
    method,
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ address }),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { statusMessage?: string, message?: string } | null
    throw new Error(payload?.statusMessage || payload?.message || `Discoflare Control Plane rejected the mailbox route (${response.status})`)
  }
  return { managed: true as const }
}

export function createManagedMailboxRoute(env: DiscoflareEnv, address: string) {
  return controlRequest(env, 'POST', address)
}

export function deleteManagedMailboxRoute(env: DiscoflareEnv, address: string) {
  return controlRequest(env, 'DELETE', address)
}
