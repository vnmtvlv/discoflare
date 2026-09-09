import { ensureDiscoflareAdminAccess, ensureWorkersHostname } from './access.js'
import { discoflareAdminWorkerName } from './admin.js'
import { cloudflareApi, cloudflareClient } from './cloudflare-client.js'
import { createError } from './errors.js'
import { adminReleaseManifestUrl, loadDiscoflareAdminRelease } from './release.js'
import type {
  DiscoflareAdminBootstrapRequest,
  DiscoflareAdminBootstrapResponse,
  DiscoflareAdminRelease,
  InstallerAssetsPayload,
} from './types.js'

export const adminInstallerMarker = 'discoflare.com/admin-v1'

type WorkerSearchResult = { id?: string, script_name?: string }
type Binding = { name?: string, type?: string, text?: string }

function textBinding(bindings: Binding[], name: string) {
  return bindings.find(binding => binding.name === name && binding.type === 'plain_text')?.text?.trim() || ''
}

function validateRequest(value: DiscoflareAdminBootstrapRequest) {
  const accountId = value.accountId?.trim() || ''
  const accountName = value.accountName?.trim() || ''
  const email = value.email?.trim().toLowerCase() || ''
  const workerName = value.workerName?.trim() || discoflareAdminWorkerName
  if (!/^[0-9a-f]{32}$/u.test(accountId)) throw createError({ statusCode: 400, statusMessage: 'Select a Cloudflare account' })
  if (!accountName || accountName.length > 200) throw createError({ statusCode: 400, statusMessage: 'Cloudflare account name is invalid' })
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(email)) throw createError({ statusCode: 400, statusMessage: 'Enter the email allowed into Discoflare Admin' })
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(workerName)) throw createError({ statusCode: 400, statusMessage: 'Discoflare Admin Worker name is invalid' })
  return { accountId, accountName, email, workerName, targetVersion: value.targetVersion?.trim() || undefined }
}

async function searchWorker(accessToken: string, accountId: string, workerName: string) {
  const workers = await cloudflareApi<WorkerSearchResult[]>(
    accessToken,
    `/accounts/${accountId}/workers/scripts-search?name=${encodeURIComponent(workerName)}`,
  )
  return workers.find(worker => worker.script_name === workerName && worker.id)
}

async function createBootstrapWorker(accessToken: string, accountId: string, workerName: string, compatibilityDate: string) {
  const metadata = {
    main_module: 'discoflare-admin-bootstrap.mjs',
    compatibility_date: compatibilityDate,
    bindings: [{ type: 'plain_text', name: 'DISCOFLARE_ADMIN_INSTALLATION', text: adminInstallerMarker }],
  }
  const source = "export default { fetch() { return new Response('Discoflare Admin is being installed.', { status: 503 }) } }"
  const form = new FormData()
  form.append('metadata', JSON.stringify(metadata))
  form.append('discoflare-admin-bootstrap.mjs', new Blob([source], { type: 'application/javascript+module' }), 'discoflare-admin-bootstrap.mjs')
  await cloudflareApi(
    accessToken,
    `/accounts/${accountId}/workers/scripts/${workerName}?excludeScript=true&bindings_inherit=strict`,
    { method: 'PUT', body: form },
  )
  const created = await searchWorker(accessToken, accountId, workerName)
  if (!created?.id) throw createError({ statusCode: 502, statusMessage: 'Cloudflare did not return the Discoflare Admin Worker ID' })
  return created.id
}

async function uploadAssets(accessToken: string, accountId: string, workerName: string, payload: Pick<InstallerAssetsPayload, 'assets'>) {
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
      if (!asset) throw createError({ statusCode: 502, statusMessage: 'Cloudflare requested an unknown Discoflare Admin asset' })
      form.append(hash, new Blob([asset.contentBase64], { type: asset.contentType }), hash)
    }
    const response = await cloudflareApi<{ jwt?: string }>(
      session.jwt,
      `/accounts/${accountId}/workers/assets/upload?base64=true`,
      { method: 'POST', body: form },
    )
    if (response.jwt) completionToken = response.jwt
  }
  if (!completionToken) throw createError({ statusCode: 502, statusMessage: 'Cloudflare did not finish the Discoflare Admin asset upload' })
  return completionToken
}

async function uploadAdminWorker(
  accessToken: string,
  request: ReturnType<typeof validateRequest>,
  release: DiscoflareAdminRelease,
  origin: string,
  access: { issuer: string, audience: string, applicationId: string },
  assetsJwt: string,
  existing: boolean,
) {
  const bindings: Array<Record<string, unknown>> = [
    { type: 'assets', name: 'ASSETS' },
    { type: 'plain_text', name: 'DISCOFLARE_ADMIN_INSTALLATION', text: adminInstallerMarker },
    { type: 'plain_text', name: 'DISCOFLARE_ADMIN_VERSION', text: release.manifest.version },
    { type: 'plain_text', name: 'DISCOFLARE_ADMIN_ACCOUNT_ID', text: request.accountId },
    { type: 'plain_text', name: 'DISCOFLARE_ADMIN_ACCOUNT_NAME', text: request.accountName },
    { type: 'plain_text', name: 'DISCOFLARE_ADMIN_EMAIL', text: request.email },
    { type: 'plain_text', name: 'DISCOFLARE_ADMIN_ORIGIN', text: origin },
    { type: 'plain_text', name: 'DISCOFLARE_ADMIN_WORKER_NAME', text: request.workerName },
    { type: 'plain_text', name: 'CF_ACCESS_ISS', text: access.issuer },
    { type: 'plain_text', name: 'CF_ACCESS_AUD', text: access.audience },
    { type: 'plain_text', name: 'CF_ACCESS_APP_ID', text: access.applicationId },
  ]
  const metadata: Record<string, unknown> = {
    main_module: 'discoflare-admin-worker.mjs',
    compatibility_date: release.manifest.compatibilityDate,
    compatibility_flags: release.manifest.compatibilityFlags,
    bindings,
    assets: { jwt: assetsJwt },
    observability: { enabled: true },
    annotations: {
      'workers/message': `Discoflare Admin ${release.manifest.version} via installer`,
      'workers/tag': `discoflare-admin-${release.manifest.version}`,
    },
  }
  if (existing) metadata.keep_bindings = ['secret_text']
  const form = new FormData()
  form.append('metadata', JSON.stringify(metadata))
  form.append('discoflare-admin-worker.mjs', new Blob([release.worker], { type: 'application/javascript+module' }), 'discoflare-admin-worker.mjs')
  await cloudflareApi(
    accessToken,
    `/accounts/${request.accountId}/workers/scripts/${request.workerName}?excludeScript=true&bindings_inherit=strict`,
    { method: 'PUT', body: form },
  )
}

export async function bootstrapDiscoflareAdmin(
  accessToken: string,
  value: DiscoflareAdminBootstrapRequest,
  options: { manifestUrl?: string } = {},
): Promise<DiscoflareAdminBootstrapResponse> {
  if (!accessToken.trim()) throw createError({ statusCode: 401, statusMessage: 'Cloudflare OAuth token is missing' })
  const request = validateRequest(value)
  const client = cloudflareClient(accessToken)
  const account = await client.accounts.get({ account_id: request.accountId })
  if (account.id !== request.accountId) throw createError({ statusCode: 403, statusMessage: 'Cloudflare account is unavailable' })
  const manifestUrl = options.manifestUrl || adminReleaseManifestUrl(request.targetVersion)
  const release = await loadDiscoflareAdminRelease(manifestUrl)
  if (request.targetVersion && release.manifest.version !== request.targetVersion.replace(/^v/u, '')) {
    throw createError({ statusCode: 502, statusMessage: 'Discoflare Admin release version does not match the requested update' })
  }

  const existingWorker = await searchWorker(accessToken, request.accountId, request.workerName)
  const existing = Boolean(existingWorker)
  let workerId = existingWorker?.id
  if (existing) {
    const settings = await client.workers.scripts.scriptAndVersionSettings.get(request.workerName, { account_id: request.accountId })
    const bindings = settings.bindings as Binding[] || []
    if (textBinding(bindings, 'DISCOFLARE_ADMIN_INSTALLATION') !== adminInstallerMarker) {
      throw createError({ statusCode: 409, statusMessage: `Worker ${request.workerName} already exists and is not Discoflare Admin` })
    }
  }
  else {
    workerId = await createBootstrapWorker(accessToken, request.accountId, request.workerName, release.manifest.compatibilityDate)
  }
  if (!workerId) throw createError({ statusCode: 502, statusMessage: 'Cloudflare did not return the Discoflare Admin Worker ID' })

  const origin = `https://${await ensureWorkersHostname(client, request.accountId, request.workerName)}`
  const access = await ensureDiscoflareAdminAccess(client, request.accountId, workerId, request.email)
  const assetsJwt = await uploadAssets(accessToken, request.accountId, request.workerName, release.assets)
  await uploadAdminWorker(accessToken, request, release, origin, access, assetsJwt, existing)
  await client.workers.scripts.subdomain.create(request.workerName, {
    account_id: request.accountId,
    enabled: true,
    previews_enabled: false,
  })

  const settings = await client.workers.scripts.scriptAndVersionSettings.get(request.workerName, { account_id: request.accountId })
  const bindings = settings.bindings as Binding[] || []
  if (textBinding(bindings, 'DISCOFLARE_ADMIN_VERSION') !== release.manifest.version) {
    throw createError({ statusCode: 502, statusMessage: 'Discoflare Admin deployment could not be verified' })
  }
  return { origin, version: release.manifest.version, workerName: request.workerName, updated: existing }
}
