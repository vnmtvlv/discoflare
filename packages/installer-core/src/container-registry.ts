import { createError } from './errors.js'

const CLOUDFLARE_REGISTRY = 'registry.cloudflare.com'
const TARGET_REPOSITORY = 'discoflare-computer'
const MANIFEST_ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ')
const IMAGE_REFERENCE = /^(?<registry>[^/]+)\/(?<repository>.+):(?<tag>[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})$/u
const DIGEST = /^sha256:[a-f0-9]{64}$/u

type RegistryCredentials = {
  username: string
  password: string
}

type RegistryDescriptor = {
  digest?: string
  platform?: { architecture?: string, os?: string }
}

type RegistryManifest = {
  schemaVersion?: number
  config?: RegistryDescriptor
  layers?: RegistryDescriptor[]
  manifests?: RegistryDescriptor[]
}

type ManifestDocument = {
  body: ArrayBuffer
  contentType: string
  manifest: RegistryManifest
}

type CloudflareEnvelope<T> = {
  success?: boolean
  result?: T
  errors?: Array<{ message?: string }>
}

function fail(statusCode: number, statusMessage: string): never {
  throw createError({ statusCode, statusMessage })
}

function parseSourceImage(image: string, version: string) {
  const match = IMAGE_REFERENCE.exec(image)
  if (!match?.groups) fail(502, 'Discoflare release Container image is invalid')
  const { registry, repository, tag } = match.groups
  if (registry !== 'ghcr.io' || repository !== 'vnmtvlv/discoflare-computer' || tag !== version) {
    fail(502, 'Discoflare release Container image does not match its version')
  }
  return { registry, repository, tag }
}

function repositoryPath(repository: string) {
  return repository.split('/').map(encodeURIComponent).join('/')
}

function basicAuthorization(credentials: RegistryCredentials) {
  return `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`
}

async function errorDetail(response: Response) {
  const text = await response.text().catch(() => '')
  if (!text) return `HTTP ${response.status}`
  try {
    const payload = JSON.parse(text) as { errors?: Array<{ message?: string }>, message?: string }
    return payload.errors?.[0]?.message || payload.message || `HTTP ${response.status}`
  }
  catch {
    return `HTTP ${response.status}`
  }
}

async function registryCredentials(
  accessToken: string,
  accountId: string,
  fetcher: typeof fetch,
): Promise<RegistryCredentials> {
  const response = await fetcher(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/containers/registries/${CLOUDFLARE_REGISTRY}/credentials`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiration_minutes: 15, permissions: ['push', 'pull'] }),
    },
  )
  const payload = await response.json().catch(() => null) as CloudflareEnvelope<RegistryCredentials> | null
  const credentials = payload?.result
  if (!response.ok || payload?.success === false || !credentials?.username || !credentials.password) {
    fail(response.status >= 400 ? response.status : 502, payload?.errors?.[0]?.message || 'Cloudflare Container Registry credentials are unavailable')
  }
  return credentials
}

async function ghcrToken(repository: string, fetcher: typeof fetch) {
  const url = new URL('https://ghcr.io/token')
  url.searchParams.set('service', 'ghcr.io')
  url.searchParams.set('scope', `repository:${repository}:pull`)
  const response = await fetcher(url, { headers: { Accept: 'application/json' } })
  const payload = await response.json().catch(() => null) as { token?: string } | null
  if (!response.ok || !payload?.token) fail(502, 'Discoflare Container image authorization failed')
  return payload.token
}

async function loadManifest(
  repository: string,
  reference: string,
  authorization: string,
  fetcher: typeof fetch,
): Promise<ManifestDocument> {
  const response = await fetcher(
    `https://ghcr.io/v2/${repositoryPath(repository)}/manifests/${encodeURIComponent(reference)}`,
    { headers: { Accept: MANIFEST_ACCEPT, Authorization: authorization } },
  )
  if (!response.ok) fail(502, `Discoflare Container manifest is unavailable (${response.status})`)
  const body = await response.arrayBuffer()
  let manifest: RegistryManifest
  try {
    manifest = JSON.parse(new TextDecoder().decode(body)) as RegistryManifest
  }
  catch {
    fail(502, 'Discoflare Container manifest is invalid')
  }
  if (manifest.schemaVersion !== 2) fail(502, 'Discoflare Container manifest schema is invalid')
  const contentType = response.headers.get('content-type')?.split(';', 1)[0] || 'application/vnd.oci.image.manifest.v1+json'
  if (manifest.manifests?.length) {
    const linuxAmd64 = manifest.manifests.find(item => item.platform?.os === 'linux' && item.platform.architecture === 'amd64')
    if (!linuxAmd64?.digest || !DIGEST.test(linuxAmd64.digest)) fail(502, 'Discoflare Container image has no linux/amd64 manifest')
    return loadManifest(repository, linuxAmd64.digest, authorization, fetcher)
  }
  if (!manifest.config?.digest || !DIGEST.test(manifest.config.digest) || !Array.isArray(manifest.layers)) {
    fail(502, 'Discoflare Container manifest has invalid descriptors')
  }
  if (manifest.layers.some(layer => !layer.digest || !DIGEST.test(layer.digest))) {
    fail(502, 'Discoflare Container manifest has invalid layers')
  }
  return { body, contentType, manifest }
}

async function targetFetch(
  accountId: string,
  path: string,
  authorization: string,
  fetcher: typeof fetch,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers)
  headers.set('Authorization', authorization)
  return fetcher(`https://${CLOUDFLARE_REGISTRY}/v2/${accountId}/${TARGET_REPOSITORY}${path}`, { ...init, headers })
}

async function copyBlob(
  accountId: string,
  sourceRepository: string,
  digest: string,
  sourceAuthorization: string,
  targetAuthorization: string,
  fetcher: typeof fetch,
) {
  const existing = await targetFetch(accountId, `/blobs/${digest}`, targetAuthorization, fetcher, { method: 'HEAD' })
  if (existing.ok) return
  if (existing.status !== 404) fail(502, `Cloudflare Container Registry blob check failed: ${await errorDetail(existing)}`)

  const source = await fetcher(
    `https://ghcr.io/v2/${repositoryPath(sourceRepository)}/blobs/${digest}`,
    { headers: { Authorization: sourceAuthorization } },
  )
  if (!source.ok || !source.body) fail(502, `Discoflare Container image layer is unavailable (${source.status})`)

  const started = await targetFetch(accountId, '/blobs/uploads/', targetAuthorization, fetcher, { method: 'POST' })
  if (started.status !== 202) fail(502, `Cloudflare Container Registry upload could not start: ${await errorDetail(started)}`)
  const location = started.headers.get('location')
  if (!location) fail(502, 'Cloudflare Container Registry did not return an upload location')
  const upload = new URL(location, `https://${CLOUDFLARE_REGISTRY}`)
  upload.searchParams.set('digest', digest)
  const uploaded = await fetcher(upload, {
    method: 'PUT',
    headers: {
      Authorization: targetAuthorization,
      'Content-Type': 'application/octet-stream',
    },
    body: source.body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })
  if (uploaded.status !== 201) fail(502, `Cloudflare Container Registry layer upload failed: ${await errorDetail(uploaded)}`)
}

/** Copies the release image into the tenant-owned Cloudflare Registry and returns its deployable reference. */
export async function ensureTenantContainerImage(
  accessToken: string,
  accountId: string,
  sourceImage: string,
  version: string,
  fetcher: typeof fetch = fetch,
) {
  const source = parseSourceImage(sourceImage, version)
  const credentials = await registryCredentials(accessToken, accountId, fetcher)
  const targetAuthorization = basicAuthorization(credentials)
  const targetImage = `${CLOUDFLARE_REGISTRY}/${accountId}/${TARGET_REPOSITORY}:${version}`
  const existing = await targetFetch(accountId, `/manifests/${encodeURIComponent(version)}`, targetAuthorization, fetcher, {
    method: 'HEAD',
    headers: { Accept: MANIFEST_ACCEPT },
  })
  if (existing.ok) return targetImage
  if (existing.status !== 404) fail(502, `Cloudflare Container Registry manifest check failed: ${await errorDetail(existing)}`)

  const sourceAuthorization = `Bearer ${await ghcrToken(source.repository, fetcher)}`
  const document = await loadManifest(source.repository, source.tag, sourceAuthorization, fetcher)
  const digests = [document.manifest.config!.digest!, ...document.manifest.layers!.map(layer => layer.digest!)]
  for (const digest of digests) {
    await copyBlob(accountId, source.repository, digest, sourceAuthorization, targetAuthorization, fetcher)
  }
  const published = await targetFetch(accountId, `/manifests/${encodeURIComponent(version)}`, targetAuthorization, fetcher, {
    method: 'PUT',
    headers: { 'Content-Type': document.contentType },
    body: document.body,
  })
  if (published.status !== 201) fail(502, `Cloudflare Container Registry manifest upload failed: ${await errorDetail(published)}`)
  return targetImage
}
