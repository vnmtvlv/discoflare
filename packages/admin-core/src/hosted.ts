import type { InstallerAssetsPayload, InstallerReleaseManifest } from './types.js'
import { cloudflareApi } from './cloudflare-client.js'
import { createError } from './errors.js'
import { installerMarker, workerObservability } from './deploy.js'
import {
  HOSTED_CAPABILITY,
  HOSTED_MODE_VALUE,
  HOSTED_USAGE_KEY,
  addHostedUsageCredit,
  freshHostedUsageLedger,
  hostedHostname,
  hostedScriptName,
  isHostedApex,
  isHostedSlug,
  parseHostedModelRates,
  parseHostedUsageLedger,
  rollHostedUsagePeriod,
  type HostedModelRates,
  type HostedUsageLedger,
} from './hosted-plan.js'
import { durableObjectMigrations, pendingMigrationBatch } from './migrations.js'
import { randomBase64Url } from './random.js'

export type HostedApi = <T>(path: string, init?: RequestInit) => Promise<T>

export type HostedProvisionRequest = {
  accountId: string
  slug: string
  apex: string
  appName: string
  ownerEmail: string
  dispatchNamespace: string
  includedUsageUnits: number
  modelRates?: HostedModelRates
  unknownTurnUnits?: number
  routingKvId?: string
}

export type HostedProvisionResult = {
  created: boolean
  url: string
  setupUrl?: string
  scriptName: string
  version: string
  databaseId: string
  bucketName: string
  kvId: string
  appliedMigrations: string[]
}

type ScriptBinding = {
  name?: string
  type?: string
  text?: string
  database_id?: string
  namespace_id?: string
  bucket_name?: string
}

const ACCOUNT_ID = /^[0-9a-f]{32}$/u
const KV_ID = /^[0-9a-f]{32}$/u

export function parseHostedProvisionRequest(value: unknown): HostedProvisionRequest {
  const body = value as Partial<HostedProvisionRequest> | null
  if (!body || typeof body !== 'object') throw createError({ statusCode: 400, statusMessage: 'Invalid hosted provision request' })
  const accountId = String(body.accountId || '').trim()
  const slug = String(body.slug || '').trim().toLowerCase()
  const apex = String(body.apex || '').trim().toLowerCase().replace(/\.$/u, '')
  const appName = String(body.appName || '').trim()
  const ownerEmail = String(body.ownerEmail || '').trim().toLowerCase()
  const dispatchNamespace = String(body.dispatchNamespace || '').trim()
  const includedUsageUnits = Number(body.includedUsageUnits)
  const routingKvId = body.routingKvId ? String(body.routingKvId).trim() : undefined
  const unknownTurnUnits = body.unknownTurnUnits == null ? undefined : Number(body.unknownTurnUnits)
  let modelRates: HostedModelRates | undefined
  if (body.modelRates != null) {
    const parsed = parseHostedModelRates(body.modelRates)
    if (!parsed) throw createError({ statusCode: 400, statusMessage: 'Model rates must map each model to integer unit rates' })
    modelRates = parsed
  }
  if (!ACCOUNT_ID.test(accountId)) throw createError({ statusCode: 400, statusMessage: 'Enter a Cloudflare account id' })
  if (!isHostedSlug(slug)) throw createError({ statusCode: 400, statusMessage: 'Workspace address must be 1–40 lowercase letters, numbers, or hyphens' })
  if (!isHostedApex(apex)) throw createError({ statusCode: 400, statusMessage: 'Invalid hosted apex domain' })
  if (!appName || appName.length > 80) throw createError({ statusCode: 400, statusMessage: 'App name must be 1–80 characters' })
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(ownerEmail)) throw createError({ statusCode: 400, statusMessage: 'Enter a valid owner email' })
  if (!/^[a-z0-9](?:[a-z0-9-_]{0,61}[a-z0-9])?$/u.test(dispatchNamespace)) {
    throw createError({ statusCode: 400, statusMessage: 'Enter a dispatch namespace' })
  }
  if (!Number.isSafeInteger(includedUsageUnits) || includedUsageUnits < 1 || includedUsageUnits > 1_000_000_000_000) {
    throw createError({ statusCode: 400, statusMessage: 'Included usage limit must be a positive integer' })
  }
  if (unknownTurnUnits != null && (!Number.isSafeInteger(unknownTurnUnits) || unknownTurnUnits < 0)) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown-turn units must be a non-negative integer' })
  }
  if (routingKvId && !KV_ID.test(routingKvId)) throw createError({ statusCode: 400, statusMessage: 'Invalid hosted routing KV namespace' })
  return { accountId, slug, apex, appName, ownerEmail, dispatchNamespace, includedUsageUnits, modelRates, unknownTurnUnits, routingKvId }
}

export function hostedUserWorkerBindings(input: {
  databaseId: string
  kvId: string
  bucketName: string
  origin: string
  appName: string
  ownerEmail: string
  accountId: string
  scriptName: string
  version: string
  includedUsageUnits: number
  durableObjects: Array<{ binding: string, className: string }>
  modelRates?: HostedModelRates
  unknownTurnUnits?: number
  authSecret?: string
  ownerSetupToken?: string
}) {
  const hostname = new URL(input.origin).hostname
  const bindings: Array<Record<string, unknown>> = [
    { type: 'd1', name: 'DB', database_id: input.databaseId },
    { type: 'kv_namespace', name: 'TICKETS', namespace_id: input.kvId },
    { type: 'r2_bucket', name: 'FILES', bucket_name: input.bucketName },
    { type: 'ai', name: 'AI' },
    { type: 'assets', name: 'ASSETS' },
    { type: 'plain_text', name: 'PUBLIC_ORIGIN', text: input.origin },
    { type: 'plain_text', name: 'APP_NAME', text: input.appName },
    { type: 'plain_text', name: 'ADMIN_WORKSPACE', text: input.appName },
    { type: 'plain_text', name: 'APP_TITLE', text: 'One workspace for humans and agents.' },
    { type: 'plain_text', name: 'APP_SUBTITLE', text: 'Built on your Cloudflare stack.' },
    { type: 'plain_text', name: 'AUTH_REGISTRATION_MODE', text: 'invite_only' },
    { type: 'plain_text', name: 'AUTH_MODE', text: 'builtin' },
    { type: 'plain_text', name: 'AGENT_MODEL', text: '@cf/moonshotai/kimi-k2.7-code' },
    { type: 'plain_text', name: 'DISCOFLARE_APP_HOSTNAME', text: hostname },
    { type: 'plain_text', name: 'DISCOFLARE_ACCOUNT_ID', text: input.accountId },
    { type: 'plain_text', name: 'DISCOFLARE_WORKER_NAME', text: input.scriptName },
    { type: 'plain_text', name: 'DISCOFLARE_CUSTOM_DOMAIN', text: 'false' },
    { type: 'plain_text', name: 'DISCOFLARE_INSTALLATION', text: installerMarker },
    { type: 'plain_text', name: 'DISCOFLARE_VERSION', text: input.version },
    { type: 'plain_text', name: 'DISCOFLARE_HOSTED', text: HOSTED_MODE_VALUE },
    { type: 'plain_text', name: 'DISCOFLARE_AGENT_USAGE_UNITS', text: String(input.includedUsageUnits) },
    ...input.durableObjects.map(item => ({ type: 'durable_object_namespace', name: item.binding, class_name: item.className })),
  ]
  if (input.modelRates) {
    bindings.push({ type: 'plain_text', name: 'DISCOFLARE_AGENT_MODEL_RATES', text: JSON.stringify(input.modelRates) })
  }
  if (input.unknownTurnUnits != null) {
    bindings.push({ type: 'plain_text', name: 'DISCOFLARE_AGENT_UNKNOWN_TURN_UNITS', text: String(input.unknownTurnUnits) })
  }
  if (input.authSecret) bindings.push({ type: 'secret_text', name: 'AUTH_SECRET', text: input.authSecret })
  bindings.push({ type: 'secret_text', name: 'ADMIN_EMAIL', text: input.ownerEmail })
  if (input.ownerSetupToken) bindings.push({ type: 'secret_text', name: 'ADMIN_SETUP_TOKEN', text: input.ownerSetupToken })
  return bindings
}

export function hostedApi(accessToken: string): HostedApi {
  return (path, init) => {
    const headers = new Headers(init?.headers)
    // The assets upload session must be presented as its own bearer token.
    // cloudflareApi always sets Authorization from the token it is given.
    const presented = headers.get('Authorization')?.replace(/^Bearer\s+/iu, '')
    if (presented) headers.delete('Authorization')
    return cloudflareApi(presented || accessToken, path, { ...init, headers })
  }
}

/**
 * Create one Hosted workspace on a Workers for Platforms dispatch namespace.
 * A repeat call for the same script returns the existing workspace and does not rotate secrets.
 */
export async function provisionHostedWorkspace(
  api: HostedApi,
  request: HostedProvisionRequest,
  release: { manifest: InstallerReleaseManifest, worker: ArrayBuffer, assets: InstallerAssetsPayload },
  now = new Date(),
): Promise<HostedProvisionResult> {
  if (!release.manifest.capabilities?.includes(HOSTED_CAPABILITY)) {
    throw createError({ statusCode: 409, statusMessage: `Discoflare ${release.manifest.version} cannot run as a hosted workspace` })
  }
  const scriptName = hostedScriptName(request.slug)
  const origin = `https://${hostedHostname(request.slug, request.apex)}`
  const scriptPath = `/accounts/${request.accountId}/workers/dispatch/namespaces/${request.dispatchNamespace}/scripts/${scriptName}`
  const existing = await readScriptSettings(api, scriptPath)
  if (existing) {
    return {
      created: false,
      url: textBinding(existing, 'PUBLIC_ORIGIN') || origin,
      scriptName,
      version: textBinding(existing, 'DISCOFLARE_VERSION') || release.manifest.version,
      databaseId: resourceBinding(existing, 'DB', 'database_id'),
      bucketName: resourceBinding(existing, 'FILES', 'bucket_name'),
      kvId: resourceBinding(existing, 'TICKETS', 'namespace_id'),
      appliedMigrations: [],
    }
  }

  const databaseId = await ensureD1(api, request.accountId, `${scriptName}-db`)
  const bucketName = await ensureR2(api, request.accountId, `${scriptName}-files`)
  const kvId = await ensureKv(api, request.accountId, `${scriptName}-tickets`)
  const appliedMigrations = await applyMigrations(api, request.accountId, databaseId, release.assets)
  const assetsJwt = await uploadDispatchAssets(api, request.accountId, request.dispatchNamespace, scriptName, release.assets)
  const ownerSetupToken = randomBase64Url(32)
  const migrations = durableObjectMigrations(release.manifest, { exists: false })
  const metadata: Record<string, unknown> = {
    main_module: 'discoflare-worker.mjs',
    compatibility_date: release.manifest.compatibilityDate,
    compatibility_flags: release.manifest.compatibilityFlags,
    bindings: hostedUserWorkerBindings({
      databaseId,
      kvId,
      bucketName,
      origin,
      appName: request.appName,
      ownerEmail: request.ownerEmail,
      accountId: request.accountId,
      scriptName,
      version: release.manifest.version,
      includedUsageUnits: request.includedUsageUnits,
      durableObjects: release.manifest.durableObjects,
      modelRates: request.modelRates,
      unknownTurnUnits: request.unknownTurnUnits,
      authSecret: randomBase64Url(48),
      ownerSetupToken,
    }),
    assets: { jwt: assetsJwt },
    observability: workerObservability,
    annotations: {
      'workers/message': `Discoflare ${release.manifest.version} hosted`,
      'workers/tag': `discoflare-${release.manifest.version}`,
    },
  }
  if (migrations) metadata.migrations = migrations
  const form = new FormData()
  form.append('metadata', JSON.stringify(metadata))
  form.append('discoflare-worker.mjs', new Blob([release.worker], { type: 'application/javascript+module' }), 'discoflare-worker.mjs')
  await api(scriptPath, { method: 'PUT', body: form })
  await putKvValue(api, request.accountId, kvId, HOSTED_USAGE_KEY, JSON.stringify(freshHostedUsageLedger(request.includedUsageUnits, now)))
  if (request.routingKvId) await setHostedWorkspaceRouting(api, request.accountId, request.routingKvId, request.slug, 'active', scriptName)
  return {
    created: true,
    url: origin,
    setupUrl: `${origin}/setup#claim=${encodeURIComponent(ownerSetupToken)}`,
    scriptName,
    version: release.manifest.version,
    databaseId,
    bucketName,
    kvId,
    appliedMigrations,
  }
}

export async function setHostedWorkspaceRouting(
  api: HostedApi,
  accountId: string,
  routingKvId: string,
  slug: string,
  status: 'active' | 'suspended',
  scriptName = hostedScriptName(slug),
) {
  if (!isHostedSlug(slug)) throw createError({ statusCode: 400, statusMessage: 'Workspace address must be 1–40 lowercase letters, numbers, or hyphens' })
  await putKvValue(api, accountId, routingKvId, `status:${slug}`, status)
  await putKvValue(api, accountId, routingKvId, `script:${slug}`, scriptName)
}

/** Add usage credit. Unused monthly inclusion does not roll over; added credit does. */
export async function addHostedAgentCredit(
  api: HostedApi,
  accountId: string,
  kvId: string,
  units: number,
  now = new Date(),
): Promise<HostedUsageLedger> {
  if (!Number.isSafeInteger(units) || units < 1) {
    throw createError({ statusCode: 400, statusMessage: 'Credit amount must be a positive integer' })
  }
  const current = await readUsageLedger(api, accountId, kvId)
  const next = addHostedUsageCredit(rollHostedUsagePeriod(current, now), units)
  await putKvValue(api, accountId, kvId, HOSTED_USAGE_KEY, JSON.stringify(next))
  return next
}

async function readScriptSettings(api: HostedApi, scriptPath: string): Promise<ScriptBinding[] | null> {
  try {
    const settings = await api<{ bindings?: ScriptBinding[] }>(`${scriptPath}/settings`)
    return settings.bindings || []
  }
  catch (error) {
    if (statusOf(error) === 404) return null
    throw error
  }
}

async function ensureD1(api: HostedApi, accountId: string, name: string) {
  const listed = await api<Array<{ name?: string, uuid?: string }>>(`/accounts/${accountId}/d1/database?name=${encodeURIComponent(name)}`)
  const found = listed.find(database => database.name === name && database.uuid)
  if (found?.uuid) return found.uuid
  const created = await api<{ uuid?: string }>(`/accounts/${accountId}/d1/database`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
  if (!created.uuid) throw createError({ statusCode: 502, statusMessage: 'Cloudflare did not return the D1 database ID' })
  return created.uuid
}

async function ensureR2(api: HostedApi, accountId: string, name: string) {
  const listed = await api<{ buckets?: Array<{ name?: string }> } | Array<{ name?: string }>>(`/accounts/${accountId}/r2/buckets?name_contains=${encodeURIComponent(name)}`)
  const buckets = Array.isArray(listed) ? listed : listed.buckets || []
  if (buckets.some(bucket => bucket.name === name)) return name
  await api(`/accounts/${accountId}/r2/buckets`, { method: 'POST', body: JSON.stringify({ name }) })
  return name
}

async function ensureKv(api: HostedApi, accountId: string, title: string) {
  const listed = await api<Array<{ id?: string, title?: string }>>(`/accounts/${accountId}/storage/kv/namespaces`)
  const found = listed.find(namespace => namespace.title === title && namespace.id)
  if (found?.id) return found.id
  const created = await api<{ id?: string }>(`/accounts/${accountId}/storage/kv/namespaces`, {
    method: 'POST',
    body: JSON.stringify({ title }),
  })
  if (!created.id) throw createError({ statusCode: 502, statusMessage: 'Cloudflare did not return the KV namespace ID' })
  return created.id
}

async function applyMigrations(api: HostedApi, accountId: string, databaseId: string, payload: InstallerAssetsPayload) {
  const query = `/accounts/${accountId}/d1/database/${databaseId}/query`
  await api(query, {
    method: 'POST',
    body: JSON.stringify({ sql: 'CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);' }),
  })
  const rows = await api<Array<{ results?: Array<{ name?: string }> }>>(query, {
    method: 'POST',
    body: JSON.stringify({ sql: 'SELECT name FROM d1_migrations;' }),
  })
  const applied = rows.flatMap(result => result.results || []).map(row => row.name).filter((name): name is string => Boolean(name))
  const batch = pendingMigrationBatch(payload.migrations, applied)
  if (!batch) return []
  const results = await api<Array<{ success?: boolean }>>(query, {
    method: 'POST',
    body: JSON.stringify({ sql: batch.sql }),
  })
  if (results.some(statement => statement.success === false)) {
    throw createError({ statusCode: 502, statusMessage: 'Discoflare migration did not complete' })
  }
  return batch.names
}

async function uploadDispatchAssets(
  api: HostedApi,
  accountId: string,
  namespace: string,
  scriptName: string,
  payload: InstallerAssetsPayload,
) {
  const manifest = Object.fromEntries(payload.assets.map(asset => [asset.path, { hash: asset.hash, size: asset.size }]))
  const session = await api<{ jwt: string, buckets?: string[][] }>(
    `/accounts/${accountId}/workers/dispatch/namespaces/${namespace}/scripts/${scriptName}/assets-upload-session`,
    { method: 'POST', body: JSON.stringify({ manifest }) },
  )
  let completionToken = session.buckets?.length ? undefined : session.jwt
  const byHash = new Map(payload.assets.map(asset => [asset.hash, asset]))
  for (const bucket of session.buckets || []) {
    const form = new FormData()
    for (const hash of bucket) {
      const asset = byHash.get(hash)
      if (!asset) throw createError({ statusCode: 502, statusMessage: 'Cloudflare requested an unknown release asset' })
      form.append(hash, new Blob([asset.contentBase64], { type: asset.contentType }), hash)
    }
    const uploaded = await api<{ jwt?: string }>(`/accounts/${accountId}/workers/assets/upload?base64=true`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.jwt}` },
      body: form,
    })
    if (uploaded.jwt) completionToken = uploaded.jwt
  }
  if (!completionToken) throw createError({ statusCode: 502, statusMessage: 'Cloudflare did not finish the static asset upload' })
  return completionToken
}

async function readUsageLedger(api: HostedApi, accountId: string, kvId: string): Promise<HostedUsageLedger> {
  let raw: unknown
  try {
    raw = await api<unknown>(`/accounts/${accountId}/storage/kv/namespaces/${kvId}/values/${encodeURIComponent(HOSTED_USAGE_KEY)}`)
  }
  catch (error) {
    if (statusOf(error) === 404) throw createError({ statusCode: 409, statusMessage: 'Hosted workspace has no agent usage ledger' })
    throw error
  }
  const ledger = parseHostedUsageLedger(raw)
  if (!ledger) throw createError({ statusCode: 409, statusMessage: 'Hosted agent usage ledger is unreadable' })
  return ledger
}

async function putKvValue(api: HostedApi, accountId: string, kvId: string, key: string, value: string) {
  await api(`/accounts/${accountId}/storage/kv/namespaces/${kvId}/values/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain' },
    body: value,
  })
}

function textBinding(bindings: ScriptBinding[], name: string) {
  return bindings.find(binding => binding.name === name)?.text || ''
}

function resourceBinding(bindings: ScriptBinding[], name: string, field: 'database_id' | 'namespace_id' | 'bucket_name') {
  const value = bindings.find(binding => binding.name === name)?.[field]
  if (!value) throw createError({ statusCode: 409, statusMessage: `Existing hosted workspace is missing ${name}` })
  return value
}

function statusOf(error: unknown) {
  if (error && typeof error === 'object' && 'statusCode' in error && typeof error.statusCode === 'number') return error.statusCode
  return undefined
}
