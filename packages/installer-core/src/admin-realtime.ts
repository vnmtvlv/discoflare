import { deriveAdminCapability } from './admin.js'
import { cloudflareApi, cloudflareClient } from './cloudflare-client.js'
import { installerMarker, type ExistingWorkerBinding } from './deploy.js'
import { createError } from './errors.js'

export type AdminRealtimeRequest = {
  workerName: string
  accountId: string
  appId: string
  method: string
  path: string
  body?: unknown
}

const allowedOperations = [
  { method: 'GET', path: /^\/presets$/u },
  { method: 'POST', path: /^\/meetings$/u },
  { method: 'POST', path: /^\/meetings\/[A-Za-z0-9_-]+\/participants$/u },
  { method: 'POST', path: /^\/meetings\/[A-Za-z0-9_-]+\/active-session\/kick-all$/u },
  { method: 'PATCH', path: /^\/meetings\/[A-Za-z0-9_-]+$/u },
] as const

function textBinding(bindings: ExistingWorkerBinding[], name: string) {
  return bindings.find(binding => binding.name === name && binding.type === 'plain_text')?.text?.trim() || ''
}

function validRequest(value: AdminRealtimeRequest) {
  return /^[0-9a-f]{32}$/u.test(value.accountId)
    && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(value.workerName)
    && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(value.appId)
    && allowedOperations.some(operation => operation.method === value.method && operation.path.test(value.path))
}

async function equalSecret(left: string, right: string) {
  const encoder = new TextEncoder()
  const a = encoder.encode(left)
  const b = encoder.encode(right)
  if (a.byteLength !== b.byteLength) return false
  const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual(left: ArrayBufferView, right: ArrayBufferView): boolean }
  return subtle.timingSafeEqual(a, b)
}

export async function proxyAdminRealtimeKit(
  accountAdminToken: string,
  capability: string,
  request: AdminRealtimeRequest,
): Promise<unknown> {
  if (!validRequest(request)) throw createError({ statusCode: 400, statusMessage: 'RealtimeKit operation is invalid' })
  const expected = await deriveAdminCapability(accountAdminToken, request.accountId, request.workerName)
  if (!await equalSecret(capability, expected)) throw createError({ statusCode: 403, statusMessage: 'Installation capability is invalid' })

  const client = cloudflareClient(accountAdminToken)
  const settings = await client.workers.scripts.scriptAndVersionSettings.get(request.workerName, { account_id: request.accountId })
  const bindings = settings.bindings as ExistingWorkerBinding[] || []
  if (textBinding(bindings, 'DISCOFLARE_INSTALLATION') !== installerMarker
    || textBinding(bindings, 'DISCOFLARE_MANAGEMENT_MODE') !== 'admin'
    || textBinding(bindings, 'REALTIMEKIT_APP_ID') !== request.appId) {
    throw createError({ statusCode: 403, statusMessage: 'Installation is not managed by this Discoflare Admin' })
  }

  return cloudflareApi<unknown>(
    accountAdminToken,
    `/accounts/${request.accountId}/realtime/kit/${encodeURIComponent(request.appId)}${request.path}`,
    {
      method: request.method,
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
    },
  )
}
