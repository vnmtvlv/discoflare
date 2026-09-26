import type { DiscoflareEnv } from '../../workers/env'
import type { InstallationDomainSettingsDTO } from '../../shared/releases'
import { fail } from './cf'

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

async function controlRequest<T>(
  env: DiscoflareEnv,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
): Promise<T | null> {
  const config = controlConfig(env)
  if (!config) return null
  const response = await fetch(`${config.endpoint}/installations/${encodeURIComponent(config.installationId)}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
    redirect: 'manual',
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { statusMessage?: string, message?: string } | null
    const error = new Error(payload?.statusMessage || payload?.message || `Discoflare Control Plane rejected the request (${response.status})`)
    Object.assign(error, { statusCode: response.status })
    throw error
  }
  return await response.json() as T
}

export function failInstallationControl(error: unknown): never {
  const candidate = error as { statusCode?: unknown, message?: unknown }
  const status = Number(candidate?.statusCode)
  fail(status >= 400 && status < 500 ? status : 502, 'control_plane', typeof candidate?.message === 'string' ? candidate.message : 'Discoflare Control Plane could not change this Installation')
}

export async function readManagedInstallationDomains(env: DiscoflareEnv): Promise<InstallationDomainSettingsDTO> {
  const state = await controlRequest<Omit<InstallationDomainSettingsDTO, 'managed'>>(env, 'GET', 'domains')
  return state
    ? { managed: true, zones: state.zones, appDomain: state.appDomain, emailDomains: state.emailDomains }
    : { managed: false, zones: [], appDomain: null, emailDomains: [] }
}

export async function connectManagedAppDomain(env: DiscoflareEnv, input: { zoneId: string, hostname: string }) {
  return controlRequest<{ hostname: string }>(env, 'PUT', 'app-domain', input)
}

export async function disconnectManagedAppDomain(env: DiscoflareEnv) {
  return controlRequest<{ hostname: string }>(env, 'DELETE', 'app-domain')
}

export async function connectManagedEmailDomain(env: DiscoflareEnv, input: { zoneId: string, domain: string }) {
  return controlRequest<{ id: string, domain: string, zoneId: string, zoneName: string }>(env, 'POST', 'email-domains', input)
}

export async function disconnectManagedEmailDomain(env: DiscoflareEnv, emailDomainId: string) {
  return controlRequest<{ disconnected: boolean }>(env, 'DELETE', `email-domains/${encodeURIComponent(emailDomainId)}`)
}

export function createManagedMailboxRoute(env: DiscoflareEnv, address: string) {
  return controlRequest(env, 'POST', 'mailbox-routes', { address })
}

export function deleteManagedMailboxRoute(env: DiscoflareEnv, address: string) {
  return controlRequest(env, 'DELETE', 'mailbox-routes', { address })
}
