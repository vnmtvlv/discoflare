import type Cloudflare from 'cloudflare'
import type { DeployProgressReporter, DeployProgressStep, DeployRequest, InstallerAssetsPayload, InstallerReleaseManifest } from './types.js'
import { cloudflareApi } from './cloudflare-client.js'
import { createError } from './errors.js'
import { durableObjectMigrations } from './migrations.js'
import { randomBase64Url } from './random.js'
import { ensureCloudflareAccess, ensureWorkersHostname } from './access.js'
import { ensurePrimaryMail } from './primary-mail.js'
import { ensureTenantContainerImage } from './container-registry.js'
import { ensureManagedRealtimeKit, realtimeKitCapability, type ManagedRealtimeKit } from './realtimekit.js'

type WorkerUploadResult = {
  deployment_id?: string
  id?: string
}

type WorkerVersion = {
  resources?: {
    bindings?: Array<{ type: string, class_name?: string, namespace_id?: string }>
  }
}

type ContainerApplication = {
  id: string
  name: string
  durable_objects?: { namespace_id?: string }
  configuration?: Record<string, unknown>
}

export type ExistingWorkerBinding = {
  name: string
  type: string
  text?: string
  class_name?: string
  database_id?: string
  bucket_name?: string
  namespace_id?: string
  workflow_name?: string
  service?: string
}

type ExistingWorker = {
  exists: boolean
  migrationTag?: string
  mailZoneId?: string
  mailDomain?: string
  appHostname?: string
  databaseId?: string
  bucketName?: string
  kvId?: string
  telemetryId?: string
  authMode?: 'access' | 'builtin'
  accessIssuer?: string
  accessAudience?: string
  accessApplicationId?: string
  accessHealthApplicationId?: string
  accessDeletionApplicationId?: string
  primary?: boolean
  realtimekitAccountId?: string
  realtimekitAppId?: string
  realtimekitVoicePreset?: string
  realtimekitAvPreset?: string
  realtimekitApiTokenConfigured?: boolean
  realtimekitManaged?: boolean
}

type EmailRoutingSettings = { enabled?: boolean; status?: string }
type EmailCatchAll = { enabled?: boolean; actions?: Array<{ type?: string; value?: string[] }> }
type DnsRecord = { name?: string; content?: string; type?: string }
type SendingSubdomain = { name: string; enabled: boolean }
type WorkerDomain = { hostname: string; service: string }
type WorkerSearchResult = { id?: string, script_name?: string }
type DeploymentHealth = { version?: string; ok?: boolean; ready?: boolean; migrated?: boolean; realtimekit?: boolean }

export const installerMarker = 'discoflare.com/v1'
const bootstrapMarker = 'discoflare.com/bootstrap/v1'

function mailDomain(request: DeployRequest) {
  return `${request.mailSubdomain}.${request.zoneName}`
}

export function isDiscoflareWorker(bindings: ExistingWorkerBinding[]) {
  const marker = bindings.find(binding => binding.name === 'DISCOFLARE_INSTALLATION')
  if (marker?.type === 'plain_text' && marker.text === installerMarker) return true

  const legacyBindings = [
    { name: 'DB', type: 'd1' },
    { name: 'FILES', type: 'r2_bucket' },
    { name: 'TICKETS', type: 'kv_namespace' },
    { name: 'CHANNEL_DO', type: 'durable_object_namespace', className: 'ChannelDurableObject' },
    { name: 'WORKSPACE_DO', type: 'durable_object_namespace', className: 'WorkspaceDurableObject' },
    { name: 'RATE_LIMIT_DO', type: 'durable_object_namespace', className: 'RateLimitDurableObject' },
    { name: 'AGENT_DO', type: 'durable_object_namespace', className: 'DiscoflareAgent' },
    { name: 'AGENT_THINK', type: 'durable_object_namespace', className: 'DiscoflareThink' },
    { name: 'AGENT_TASK_WORKFLOW', type: 'workflow', className: 'AgentTaskWorkflow' },
  ]

  return legacyBindings.every(expected => bindings.some(binding => (
    binding.name === expected.name
    && binding.type === expected.type
    && (!expected.className || binding.class_name === expected.className)
  )))
}

async function inspectWorker(client: Cloudflare, accountId: string, workerName: string): Promise<ExistingWorker> {
  for await (const worker of client.workers.scripts.list({ account_id: accountId })) {
    if (worker.id !== workerName) continue
    const settings = await client.workers.scripts.scriptAndVersionSettings.get(workerName, { account_id: accountId })
    const bindings = settings.bindings as ExistingWorkerBinding[] || []
    const marker = bindings.find(binding => binding.name === 'DISCOFLARE_INSTALLATION')
    if (marker?.type === 'plain_text' && marker.text === bootstrapMarker) return { exists: false }
    if (!isDiscoflareWorker(bindings)) {
      throw createError({ statusCode: 409, statusMessage: `A non-Discoflare Worker named ${workerName} already exists` })
    }
    const text = (name: string) => bindings.find(binding => binding.name === name && binding.type === 'plain_text')?.text
    return {
      exists: true,
      migrationTag: worker.migration_tag,
      mailZoneId: text('MAIL_ZONE_ID'),
      mailDomain: text('MAIL_DOMAIN'),
      appHostname: text('DISCOFLARE_APP_HOSTNAME') || text('MAIL_APP_HOSTNAME'),
      databaseId: bindings.find(binding => binding.name === 'DB' && binding.type === 'd1')?.database_id,
      bucketName: bindings.find(binding => binding.name === 'FILES' && binding.type === 'r2_bucket')?.bucket_name,
      kvId: bindings.find(binding => binding.name === 'TICKETS' && binding.type === 'kv_namespace')?.namespace_id,
      telemetryId: text('DISCOFLARE_TELEMETRY_ID'),
      authMode: text('AUTH_MODE') === 'access' ? 'access' : 'builtin',
      accessIssuer: text('CF_ACCESS_ISS'),
      accessAudience: text('CF_ACCESS_AUD'),
      accessApplicationId: text('CF_ACCESS_APP_ID'),
      accessHealthApplicationId: text('CF_ACCESS_HEALTH_APP_ID'),
      accessDeletionApplicationId: text('CF_ACCESS_DELETION_APP_ID'),
      primary: text('DISCOFLARE_PRIMARY') === 'true',
      realtimekitAccountId: text('REALTIMEKIT_ACCOUNT_ID'),
      realtimekitAppId: text('REALTIMEKIT_APP_ID'),
      realtimekitVoicePreset: text('REALTIMEKIT_PRESET_VOICE'),
      realtimekitAvPreset: text('REALTIMEKIT_PRESET_AV'),
      realtimekitApiTokenConfigured: bindings.some(binding => binding.name === 'REALTIMEKIT_API_KEY' && binding.type === 'secret_text'),
      realtimekitManaged: text('DISCOFLARE_REALTIMEKIT_MANAGED') === 'true',
    }
  }
  return { exists: false }
}

async function primaryWorker(client: Cloudflare, accountId: string): Promise<string | null> {
  for await (const worker of client.workers.scripts.list({ account_id: accountId })) {
    if (!worker.id) continue
    const settings = await client.workers.scripts.scriptAndVersionSettings.get(worker.id, { account_id: accountId })
    const bindings = settings.bindings as ExistingWorkerBinding[] || []
    const marker = bindings.find(binding => binding.name === 'DISCOFLARE_INSTALLATION')
    const primary = bindings.find(binding => binding.name === 'DISCOFLARE_PRIMARY')
    if (marker?.type === 'plain_text' && marker.text === installerMarker && primary?.text === 'true') return worker.id
  }
  return null
}

async function ensureD1(client: Cloudflare, accountId: string, name: string) {
  for await (const database of client.d1.database.list({ account_id: accountId, name })) {
    if (database.name === name && database.uuid) return database.uuid
  }
  const database = await client.d1.database.create({ account_id: accountId, name })
  if (!database.uuid) throw createError({ statusCode: 502, statusMessage: 'Cloudflare did not return the D1 database ID' })
  return database.uuid
}

async function ensureR2(client: Cloudflare, accountId: string, name: string) {
  let cursor: string | undefined
  do {
    const page = await client.r2.buckets.list({ account_id: accountId, name_contains: name, cursor })
    if (page.buckets?.some(bucket => bucket.name === name)) return name
    cursor = (page as { cursor?: string }).cursor
  } while (cursor)
  await client.r2.buckets.create({ account_id: accountId, name })
  return name
}

async function ensureKv(client: Cloudflare, accountId: string, title: string) {
  for await (const namespace of client.kv.namespaces.list({ account_id: accountId, per_page: 100 })) {
    if (namespace.title === title) return namespace.id
  }
  return (await client.kv.namespaces.create({ account_id: accountId, title })).id
}

async function assertDomainAvailable(accessToken: string, request: DeployRequest) {
  if (request.customDomainEnabled) {
    const hostname = `${request.appSubdomain}.${request.zoneName}`
    const domains = await cloudflareApi<WorkerDomain[]>(accessToken, `/accounts/${request.accountId}/workers/domains`)
    const attached = domains.find(domain => domain.hostname.toLowerCase() === hostname)
    if (attached && attached.service !== request.workerName) {
      throw createError({ statusCode: 409, statusMessage: `${hostname} is already attached to Worker ${attached.service}` })
    }
  }
  if (!request.mailEnabled) return

  const requestedMailDomain = mailDomain(request)
  const [mxRecords, routing] = await Promise.all([
    cloudflareApi<DnsRecord[]>(accessToken, `/zones/${request.zoneId}/dns_records?type=MX&name=${encodeURIComponent(requestedMailDomain)}&per_page=100`),
    cloudflareApi<EmailRoutingSettings>(accessToken, `/zones/${request.zoneId}/email/routing`),
  ])
  const foreignMx = mxRecords.filter(record => !String(record.content || '').toLowerCase().endsWith('.mx.cloudflare.net'))
  if (foreignMx.length) {
    throw createError({
      statusCode: 409,
      statusMessage: `${requestedMailDomain} already has mail exchange records. Discoflare will not replace another mail provider.`,
    })
  }
  if (routing.enabled) {
    const catchAll = await cloudflareApi<EmailCatchAll>(accessToken, `/zones/${request.zoneId}/email/routing/rules/catch_all`)
    const target = catchAll.actions?.find(action => action.type === 'worker')?.value?.[0]
    if (catchAll.enabled && target && target !== request.workerName) {
      throw createError({ statusCode: 409, statusMessage: `${request.zoneName} already routes catch-all email to Worker ${target}` })
    }
    if (catchAll.enabled && !target) {
      throw createError({ statusCode: 409, statusMessage: `${request.zoneName} already has a catch-all email rule. Discoflare will not replace it.` })
    }
  }
}

async function ensureEmailRouting(accessToken: string, request: DeployRequest) {
  const requestedMailDomain = mailDomain(request)
  const mxRecords = await cloudflareApi<DnsRecord[]>(
    accessToken,
    `/zones/${request.zoneId}/dns_records?type=MX&name=${encodeURIComponent(requestedMailDomain)}&per_page=100`,
  )
  if (mxRecords.some(record => String(record.content || '').toLowerCase().endsWith('.mx.cloudflare.net'))) return
  await cloudflareApi(accessToken, `/zones/${request.zoneId}/email/routing/dns`, {
    method: 'POST',
    body: JSON.stringify({ name: requestedMailDomain }),
  })
}

async function ensureEmailSending(accessToken: string, request: DeployRequest) {
  const requestedMailDomain = mailDomain(request)
  const domains = await cloudflareApi<SendingSubdomain[]>(accessToken, `/zones/${request.zoneId}/email/sending/subdomains`)
  if (domains.some(domain => domain.name.toLowerCase() === requestedMailDomain && domain.enabled)) return
  await cloudflareApi(accessToken, `/zones/${request.zoneId}/email/sending/subdomains`, {
    method: 'POST',
    body: JSON.stringify({ name: requestedMailDomain }),
  })
}

async function attachAppDomain(accessToken: string, request: DeployRequest) {
  await cloudflareApi(accessToken, `/accounts/${request.accountId}/workers/domains`, {
    method: 'PUT',
    body: JSON.stringify({
      hostname: `${request.appSubdomain}.${request.zoneName}`,
      service: request.workerName,
      zone_id: request.zoneId,
      zone_name: request.zoneName,
    }),
  })
}

async function attachMailCatchAll(accessToken: string, request: DeployRequest, primaryWorkerName: string) {
  await cloudflareApi(accessToken, `/zones/${request.zoneId}/email/routing/rules/catch_all`, {
    method: 'PUT',
    body: JSON.stringify({
      name: `Discoflare primary workspace mail for ${request.zoneName}`,
      enabled: true,
      matchers: [{ type: 'all' }],
      actions: [{ type: 'worker', value: [primaryWorkerName] }],
    }),
  })
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

async function applyD1Migrations(accessToken: string, accountId: string, databaseId: string, payload: InstallerAssetsPayload) {
  const names = new Set<string>()
  for (const migration of payload.migrations) {
    if (!/^[0-9A-Za-z_.-]+$/.test(migration.name)) {
      throw createError({ statusCode: 502, statusMessage: `Discoflare migration ${migration.name} has an invalid name` })
    }
    if (names.has(migration.name)) {
      throw createError({ statusCode: 502, statusMessage: `Discoflare migration ${migration.name} is duplicated` })
    }
    names.add(migration.name)
  }

  await cloudflareApi(accessToken, `/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: 'POST',
    body: JSON.stringify({ sql: 'CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);' }),
  })
  const rows = await cloudflareApi<Array<{ results?: Array<{ name?: string }> }>>(
    accessToken,
    `/accounts/${accountId}/d1/database/${databaseId}/query`,
    { method: 'POST', body: JSON.stringify({ sql: 'SELECT name FROM d1_migrations;' }) },
  )
  const applied = new Set(rows.flatMap(result => result.results || []).map(row => row.name).filter(Boolean))
  const pending: string[] = []
  for (const migration of payload.migrations) {
    if (applied.has(migration.name)) continue
    const sql = `${migration.sql.replaceAll('--> statement-breakpoint', '\n')}\nINSERT INTO d1_migrations (name) VALUES (${sqlString(migration.name)});`
    const result = await cloudflareApi<Array<{ success?: boolean }>>(accessToken, `/accounts/${accountId}/d1/database/${databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify({ sql }),
    })
    if (!result.length || result.some(statement => statement.success === false)) {
      throw createError({ statusCode: 502, statusMessage: `Discoflare migration ${migration.name} did not complete` })
    }
    pending.push(migration.name)
  }
  if (pending.length) {
    const verified = await cloudflareApi<Array<{ results?: Array<{ name?: string }> }>>(
      accessToken,
      `/accounts/${accountId}/d1/database/${databaseId}/query`,
      { method: 'POST', body: JSON.stringify({ sql: 'SELECT name FROM d1_migrations;' }) },
    )
    const recorded = new Set(verified.flatMap(result => result.results || []).map(row => row.name).filter(Boolean))
    const missing = pending.find(name => !recorded.has(name))
    if (missing) throw createError({ statusCode: 502, statusMessage: `Discoflare migration ${missing} was not recorded` })
  }
  return pending
}

async function uploadAssets(accessToken: string, accountId: string, workerName: string, payload: InstallerAssetsPayload) {
  const manifest = Object.fromEntries(payload.assets.map(asset => [asset.path, { hash: asset.hash, size: asset.size }]))
  const session = await cloudflareApi<{ jwt: string, buckets?: string[][] }>(
    accessToken,
    `/accounts/${accountId}/workers/scripts/${workerName}/assets-upload-session`,
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
    const response = await cloudflareApi<{ jwt?: string }>(
      session.jwt,
      `/accounts/${accountId}/workers/assets/upload?base64=true`,
      { method: 'POST', body: form },
    )
    if (response.jwt) completionToken = response.jwt
  }
  if (!completionToken) throw createError({ statusCode: 502, statusMessage: 'Cloudflare did not finish the static asset upload' })
  return completionToken
}

async function ensureBootstrapWorkerTarget(accessToken: string, accountId: string, workerName: string, compatibilityDate: string) {
  const metadata = {
    main_module: 'discoflare-bootstrap.mjs',
    compatibility_date: compatibilityDate,
    bindings: [{ type: 'plain_text', name: 'DISCOFLARE_INSTALLATION', text: bootstrapMarker }],
  }
  const source = "export default { fetch() { return new Response('Discoflare is being installed.', { status: 503 }) } }"
  const form = new FormData()
  form.append('metadata', JSON.stringify(metadata))
  form.append('discoflare-bootstrap.mjs', new Blob([source], { type: 'application/javascript+module' }), 'discoflare-bootstrap.mjs')
  await cloudflareApi(
    accessToken,
    `/accounts/${accountId}/workers/scripts/${workerName}?excludeScript=true&bindings_inherit=strict`,
    { method: 'PUT', body: form },
  )
  const workers = await cloudflareApi<WorkerSearchResult[]>(
    accessToken,
    `/accounts/${accountId}/workers/scripts-search?name=${encodeURIComponent(workerName)}`,
  )
  const workerId = workers.find(worker => worker.script_name === workerName)?.id
  if (!workerId) throw createError({ statusCode: 502, statusMessage: 'Cloudflare did not return the Worker ID required by Access' })
  return workerId
}

async function uploadWorker(
  accessToken: string,
  accountId: string,
  request: DeployRequest,
  manifest: InstallerReleaseManifest,
  worker: ArrayBuffer,
  resources: { databaseId: string, bucketName: string, kvId: string, assetsJwt: string, origin: string },
  existing: ExistingWorker,
  ownerSetupToken: string | null,
  telemetry: { installationId: string, token: string },
  access: { issuer: string, audience: string, applicationId: string, healthApplicationId: string, deletionApplicationId: string } | null,
  primary: boolean,
  realtimekit: ManagedRealtimeKit | null,
) {
  const hostname = new URL(resources.origin).hostname
  const bindings: Array<Record<string, unknown>> = [
    { type: 'd1', name: 'DB', database_id: resources.databaseId },
    { type: 'r2_bucket', name: 'FILES', bucket_name: resources.bucketName },
    { type: 'kv_namespace', name: 'TICKETS', namespace_id: resources.kvId },
    { type: 'ai', name: 'AI' },
    { type: 'assets', name: 'ASSETS' },
    { type: 'workflow', name: manifest.workflow.binding, workflow_name: `${request.workerName}-agent-tasks`, class_name: manifest.workflow.className },
    { type: 'plain_text', name: 'PUBLIC_ORIGIN', text: resources.origin },
    { type: 'plain_text', name: 'APP_NAME', text: request.appName },
    { type: 'plain_text', name: 'ADMIN_WORKSPACE', text: request.appName },
    { type: 'plain_text', name: 'APP_TITLE', text: 'One workspace for humans and agents.' },
    { type: 'plain_text', name: 'APP_SUBTITLE', text: 'Built on your Cloudflare stack.' },
    { type: 'plain_text', name: 'AUTH_REGISTRATION_MODE', text: request.registrationMode },
    { type: 'plain_text', name: 'AUTH_MODE', text: request.authMode },
    { type: 'plain_text', name: 'AGENT_MODEL', text: '@cf/moonshotai/kimi-k2.7-code' },
    { type: 'plain_text', name: 'DISCOFLARE_APP_HOSTNAME', text: hostname },
    { type: 'plain_text', name: 'DISCOFLARE_INSTALLATION', text: installerMarker },
    { type: 'plain_text', name: 'DISCOFLARE_VERSION', text: manifest.version },
    { type: 'plain_text', name: 'DISCOFLARE_TELEMETRY_ID', text: telemetry.installationId },
    { type: 'plain_text', name: 'DISCOFLARE_TELEMETRY_ENDPOINT', text: 'https://discoflare.com/api/telemetry/heartbeat' },
    { type: 'secret_text', name: 'DISCOFLARE_TELEMETRY_TOKEN', text: telemetry.token },
    ...manifest.durableObjects.map(item => ({ type: 'durable_object_namespace', name: item.binding, class_name: item.className })),
  ]
  if (primary) bindings.push({ type: 'plain_text', name: 'DISCOFLARE_PRIMARY', text: 'true' })
  if (access) {
    bindings.push(
      { type: 'plain_text', name: 'CF_ACCESS_ISS', text: access.issuer },
      { type: 'plain_text', name: 'CF_ACCESS_AUD', text: access.audience },
      { type: 'plain_text', name: 'CF_ACCESS_APP_ID', text: access.applicationId },
      { type: 'plain_text', name: 'CF_ACCESS_HEALTH_APP_ID', text: access.healthApplicationId },
      { type: 'plain_text', name: 'CF_ACCESS_DELETION_APP_ID', text: access.deletionApplicationId },
    )
  }
  if (request.mailEnabled) {
    bindings.push(
      { type: 'send_email', name: 'MAIL_EMAIL' },
      { type: 'plain_text', name: 'DISCOFLARE_MAIL_ROUTES', text: '[]' },
      { type: 'plain_text', name: 'MAIL_DOMAIN', text: mailDomain(request) },
      { type: 'plain_text', name: 'MAIL_ZONE_ID', text: request.zoneId },
      { type: 'plain_text', name: 'MAIL_APP_HOSTNAME', text: hostname },
      { type: 'plain_text', name: 'MAIL_DEFAULT_LOCAL_PART', text: request.mailLocalPart },
    )
  }
  if (realtimekit) {
    bindings.push(
      { type: 'plain_text', name: 'REALTIMEKIT_ACCOUNT_ID', text: realtimekit.accountId },
      { type: 'plain_text', name: 'REALTIMEKIT_APP_ID', text: realtimekit.appId },
      { type: 'plain_text', name: 'REALTIMEKIT_PRESET_VOICE', text: realtimekit.voicePreset },
      { type: 'plain_text', name: 'REALTIMEKIT_PRESET_AV', text: realtimekit.avPreset },
    )
    if (realtimekit.apiToken) bindings.push({ type: 'secret_text', name: 'REALTIMEKIT_API_KEY', text: realtimekit.apiToken })
    if (realtimekit.managed) {
      bindings.push({ type: 'plain_text', name: 'DISCOFLARE_REALTIMEKIT_MANAGED', text: 'true' })
    }
  }
  if (!existing.exists) {
    bindings.push(
      { type: 'secret_text', name: 'AUTH_SECRET', text: randomBase64Url(48) },
      { type: 'secret_text', name: 'ADMIN_EMAIL', text: request.adminEmail },
    )
    if (ownerSetupToken) bindings.push({ type: 'secret_text', name: 'ADMIN_SETUP_TOKEN', text: ownerSetupToken })
  }

  const migrations = durableObjectMigrations(manifest, existing)
  const metadata: Record<string, unknown> = {
    main_module: 'discoflare-worker.mjs',
    compatibility_date: manifest.compatibilityDate,
    compatibility_flags: manifest.compatibilityFlags,
    bindings,
    containers: [{ name: `${request.workerName}-computer`, class_name: manifest.container.className }],
    assets: { jwt: resources.assetsJwt },
    observability: { enabled: true },
    annotations: {
      'workers/message': `Discoflare ${manifest.version} via installer`,
      'workers/tag': `discoflare-${manifest.version}`,
    },
  }
  if (migrations) metadata.migrations = migrations
  if (existing.exists) metadata.keep_bindings = ['secret_text']

  const form = new FormData()
  form.append('metadata', JSON.stringify(metadata))
  form.append('discoflare-worker.mjs', new Blob([worker], { type: 'application/javascript+module' }), 'discoflare-worker.mjs')
  return cloudflareApi<WorkerUploadResult>(
    accessToken,
    `/accounts/${accountId}/workers/scripts/${request.workerName}?excludeScript=true&bindings_inherit=strict`,
    { method: 'PUT', body: form },
  )
}

async function deployContainer(
  accessToken: string,
  accountId: string,
  workerName: string,
  versionId: string | undefined,
  manifest: InstallerReleaseManifest,
) {
  if (!versionId) throw createError({ statusCode: 502, statusMessage: 'Cloudflare did not return the Worker version ID' })
  const normalizedVersionId = versionId.includes('-')
    ? versionId
    : versionId.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')
  const version = await cloudflareApi<WorkerVersion>(accessToken, `/accounts/${accountId}/workers/scripts/${workerName}/versions/${normalizedVersionId}`)
  const namespaceId = version.resources?.bindings?.find(binding => binding.type === 'durable_object_namespace' && binding.class_name === manifest.container.className)?.namespace_id
  if (!namespaceId) throw createError({ statusCode: 502, statusMessage: 'Agent Computer Durable Object was not provisioned' })

  const name = `${workerName}-computer`
  const applications = await cloudflareApi<ContainerApplication[]>(accessToken, `/accounts/${accountId}/containers/applications`)
  const existing = applications.find(application => application.name === name)
  if (existing?.durable_objects?.namespace_id && existing.durable_objects.namespace_id !== namespaceId) {
    throw createError({ statusCode: 409, statusMessage: `Container application ${name} belongs to another Worker` })
  }

  const image = await ensureTenantContainerImage(accessToken, accountId, manifest.container.image, manifest.version)
  const configuration = {
    image,
    instance_type: manifest.container.instanceType,
    observability: { logs: { enabled: true } },
  }
  if (!existing) {
    await cloudflareApi(accessToken, `/accounts/${accountId}/containers/applications`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        scheduling_policy: 'default',
        configuration,
        instances: 0,
        max_instances: manifest.container.maxInstances,
        constraints: { tiers: [1, 2] },
        durable_objects: { namespace_id: namespaceId },
        rollout_active_grace_period: 0,
      }),
    })
    return
  }

  await cloudflareApi(accessToken, `/accounts/${accountId}/containers/applications/${existing.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ configuration, max_instances: manifest.container.maxInstances }),
  })
  await cloudflareApi(accessToken, `/accounts/${accountId}/containers/applications/${existing.id}/rollouts`, {
    method: 'POST',
    body: JSON.stringify({
      description: `Discoflare ${manifest.version}`,
      strategy: 'rolling',
      target_configuration: configuration,
      step_percentage: 100,
      kind: 'full_auto',
    }),
  })
}

async function verifyDeployment(origin: string, version: string, expectReady: boolean, expectRealtimeKit: boolean, report?: DeployProgressReporter) {
  const attempts = 10
  let lastStatus = 0
  let lastFailure = ''
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await report?.({
      type: 'progress',
      step: 'verify',
      state: 'active',
      detail: `Attempt ${attempt + 1} of ${attempts}`,
    })
    if (attempt) await new Promise(resolve => setTimeout(resolve, 3_000))
    try {
      const response = await fetch(`${origin}/api/setup/health`, {
        headers: { Accept: 'application/json' },
        redirect: 'manual',
        cache: 'no-store',
      })
      lastStatus = response.status
      if (!response.ok) {
        lastFailure = `HTTP ${response.status}`
        continue
      }
      const health = await response.json() as DeploymentHealth
      if (
        health.version === version
        && health.ok
        && health.migrated
        && (!expectReady || health.ready)
        && (!expectRealtimeKit || health.realtimekit)
      ) return true
      lastFailure = `health response was not ready for Discoflare ${version}`
    }
    catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error)
    }
  }
  throw createError({
    statusCode: 502,
    statusMessage: `Discoflare ${version} was deployed, but workspace health verification did not complete${lastFailure ? `: ${lastFailure}` : lastStatus ? ` (HTTP ${lastStatus})` : ''}`,
  })
}

export async function deployDiscoflare(
  client: Cloudflare,
  accessToken: string,
  request: DeployRequest,
  release: { manifest: InstallerReleaseManifest, worker: ArrayBuffer, assets: InstallerAssetsPayload },
  report?: DeployProgressReporter,
) {
  const progress = async (step: DeployProgressStep, state: 'active' | 'complete', detail?: string) => {
    await report?.({ type: 'progress', step, state, detail })
  }

  await progress('installation', 'active')
  if (request.mailEnabled && !release.manifest.capabilities?.includes('primary-workspace-mail-v1')) {
    throw createError({ statusCode: 409, statusMessage: `Discoflare ${release.manifest.version} does not support primary workspace mail` })
  }
  if (request.realtimekitEnabled && !release.manifest.capabilities?.includes(realtimeKitCapability)) {
    throw createError({ statusCode: 409, statusMessage: `Discoflare ${release.manifest.version} does not support managed RealtimeKit` })
  }
  const existing = await inspectWorker(client, request.accountId, request.workerName)
  const existingPrimary = await primaryWorker(client, request.accountId)
  const primary = existing.exists ? existing.primary === true : existingPrimary === null
  if (request.mailEnabled && !primary) {
    throw createError({
      statusCode: 409,
      statusMessage: `Mail is owned by primary Discoflare Worker ${existingPrimary}. Multi-workspace mail routing is not enabled in this base release.`,
    })
  }
  if (existing.exists && existing.authMode !== request.authMode) {
    throw createError({ statusCode: 409, statusMessage: 'Changing authentication mode on an existing installation requires a manual migration.' })
  }
  const requestedHostname = request.customDomainEnabled
    ? `${request.appSubdomain}.${request.zoneName}`
    : existing.appHostname || await ensureWorkersHostname(client, request.accountId, request.workerName)
  await assertDomainAvailable(accessToken, request)
  const requestedMailDomain = mailDomain(request)
  if (existing.appHostname && existing.appHostname !== requestedHostname) {
    throw createError({
      statusCode: 409,
      statusMessage: `This Discoflare installation already owns ${existing.appHostname}. Domain moves require removing the old Cloudflare route first.`,
    })
  }
  if (existing.exists && Boolean(existing.mailZoneId) !== request.mailEnabled) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Changing workspace email on an existing installation requires a manual migration.',
    })
  }
  if (request.mailEnabled && existing.mailZoneId && (
    existing.mailZoneId !== request.zoneId
    || existing.mailDomain !== requestedMailDomain
  )) {
    throw createError({
      statusCode: 409,
      statusMessage: `This Discoflare installation already owns ${existing.mailDomain} at ${existing.appHostname}. Domain moves require removing the old Cloudflare routes first.`,
    })
  }
  await progress('installation', 'complete', existing.exists ? 'Existing installation found' : requestedHostname)
  if (!existing.exists) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(request.adminEmail)) {
      throw createError({ statusCode: 400, statusMessage: 'Enter a valid owner email' })
    }
  }
  const ownerSetupToken = existing.exists || request.authMode === 'access' ? null : randomBase64Url(32)
  const telemetry = {
    installationId: existing.telemetryId || crypto.randomUUID(),
    token: randomBase64Url(32),
  }
  await progress('storage', 'active')
  const [databaseId, bucketName, kvId] = existing.exists
    ? [existing.databaseId, existing.bucketName, existing.kvId]
    : await Promise.all([
        ensureD1(client, request.accountId, `${request.workerName}-db`),
        ensureR2(client, request.accountId, `${request.workerName}-files`),
        ensureKv(client, request.accountId, `${request.workerName}-tickets`),
      ])
  if (!databaseId || !bucketName || !kvId) {
    throw createError({ statusCode: 409, statusMessage: 'Existing Discoflare storage bindings are incomplete' })
  }
  await progress('storage', 'complete', existing.exists ? 'Reusing D1, R2, and KV' : 'D1, R2, and KV ready')

  await progress('database', 'active')
  const appliedMigrations = await applyD1Migrations(accessToken, request.accountId, databaseId, release.assets)
  await progress('database', 'complete', appliedMigrations.length ? `${appliedMigrations.length} applied` : 'Up to date')

  await progress('assets', 'active')
  const bootstrapRequired = !existing.exists && (request.mailEnabled || (request.authMode === 'access' && !request.customDomainEnabled))
  const accessWorkerId = bootstrapRequired
    ? await ensureBootstrapWorkerTarget(accessToken, request.accountId, request.workerName, release.manifest.compatibilityDate)
    : undefined
  const assetsJwt = await uploadAssets(accessToken, request.accountId, request.workerName, release.assets)
  await progress('assets', 'complete')
  const origin = `https://${requestedHostname}`
  await progress('access', 'active')
  const access = request.authMode === 'access'
    ? existing.exists
      ? {
          issuer: existing.accessIssuer || '',
          audience: existing.accessAudience || '',
          applicationId: existing.accessApplicationId || '',
          healthApplicationId: existing.accessHealthApplicationId || '',
          deletionApplicationId: existing.accessDeletionApplicationId || '',
        }
      : await ensureCloudflareAccess(client, request, requestedHostname, accessWorkerId)
    : null
  if (access && Object.values(access).some(value => !value)) {
    throw createError({ statusCode: 409, statusMessage: 'Existing Cloudflare Access bindings are incomplete' })
  }
  await progress('access', 'complete', request.authMode === 'access' ? 'Email code sign-in ready' : 'Using Discoflare accounts')

  let realtimekit: ManagedRealtimeKit | null = null
  await progress('realtimekit', 'active')
  const existingRealtimeKit = Boolean(
    existing.realtimekitAccountId
    && existing.realtimekitAppId
    && existing.realtimekitApiTokenConfigured,
  )
  if (existingRealtimeKit) {
    realtimekit = {
      accountId: existing.realtimekitAccountId!,
      appId: existing.realtimekitAppId!,
      voicePreset: existing.realtimekitVoicePreset || 'voice',
      avPreset: existing.realtimekitAvPreset || existing.realtimekitVoicePreset || 'group_call_host',
      managed: existing.realtimekitManaged === true,
    }
    await progress('realtimekit', 'complete', existing.realtimekitManaged ? 'Managed credentials reused' : 'Existing credentials preserved')
  }
  else if (request.realtimekitEnabled) {
    if (!request.realtimekitApiToken) {
      throw createError({ statusCode: 400, statusMessage: 'Create and paste a Cloudflare Realtime API token to enable Huddles' })
    }
    realtimekit = await ensureManagedRealtimeKit(request.realtimekitApiToken, request.accountId, request.workerName, {
      appId: existing.realtimekitAppId,
    })
    await progress('realtimekit', 'complete', 'App, presets, and runtime token verified')
  }
  else {
    await progress('realtimekit', 'complete', 'Skipped')
  }

  await progress('worker', 'active')
  const primaryMail = request.mailEnabled
    ? await ensurePrimaryMail(
        client,
        accessToken,
        request,
      )
    : null
  const uploaded = await uploadWorker(accessToken, request.accountId, request, release.manifest, release.worker, {
    databaseId,
    bucketName,
    kvId,
    assetsJwt,
    origin,
  }, existing, ownerSetupToken, telemetry, access, primary, realtimekit)
  await progress('worker', 'complete', `Discoflare ${release.manifest.version}`)

  await progress('domain', 'active')
  await client.workers.scripts.subdomain.create(request.workerName, {
    account_id: request.accountId,
    enabled: !request.customDomainEnabled,
    previews_enabled: false,
  })
  if (request.customDomainEnabled) await attachAppDomain(accessToken, request)
  await progress('domain', 'complete', requestedHostname)

  await progress('mail', 'active')
  if (request.mailEnabled) {
    await Promise.all([
      ensureEmailRouting(accessToken, request),
      ensureEmailSending(accessToken, request),
    ])
    await attachMailCatchAll(accessToken, request, primaryMail!.name)
  }
  await progress('mail', 'complete', request.mailEnabled ? mailDomain(request) : 'Skipped')

  await progress('computer', 'active')
  await deployContainer(accessToken, request.accountId, request.workerName, uploaded.deployment_id || uploaded.id, release.manifest)
  await progress('computer', 'complete')

  await progress('schedule', 'active')
  await client.workers.scripts.schedules.update(request.workerName, {
    account_id: request.accountId,
    body: [{ cron: '17 4 * * 1' }],
  })
  await progress('schedule', 'complete')

  await progress('verify', 'active')
  await verifyDeployment(
    origin,
    release.manifest.version,
    existing.exists && request.authMode !== 'access',
    Boolean(realtimekit),
    report,
  )
  await progress('verify', 'complete', 'Workspace health verified')
  return {
    url: origin,
    setupUrl: ownerSetupToken ? `${origin}/setup#claim=${encodeURIComponent(ownerSetupToken)}` : undefined,
    version: release.manifest.version,
    updated: existing.exists,
    appliedMigrations,
    verified: true,
    telemetry,
  }
}
