type ReleaseManifest = { version?: unknown }

const RELEASE_CACHE_TTL_MS = 60_000
const releaseCache = new Map<string, { value: string | null, expiresAt: number }>()
const releaseInFlight = new Map<string, Promise<string | null>>()

async function fetchLatestReleaseVersion(manifestUrl: string) {
  const response = await fetch(manifestUrl, { redirect: 'follow' })
  if (!response.ok) return null
  const manifest = await response.json() as ReleaseManifest
  return typeof manifest.version === 'string' ? manifest.version : null
}

async function latestReleaseVersion(manifestUrl: unknown) {
  const key = String(manifestUrl)
  const cached = releaseCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  let pending = releaseInFlight.get(key)
  if (!pending) {
    pending = fetchLatestReleaseVersion(key)
      .then(value => {
        releaseCache.set(key, { value, expiresAt: Date.now() + RELEASE_CACHE_TTL_MS })
        return value
      })
      .finally(() => { releaseInFlight.delete(key) })
    releaseInFlight.set(key, pending)
  }
  return pending
}

export function latestWorkspaceVersion(event: Parameters<typeof useRuntimeConfig>[0]) {
  return latestReleaseVersion(useRuntimeConfig(event).workspaceManifestUrl)
}

export function latestAdminVersion(event: Parameters<typeof useRuntimeConfig>[0]) {
  return latestReleaseVersion(useRuntimeConfig(event).adminManifestUrl)
}
