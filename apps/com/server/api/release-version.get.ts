let cache: { version: string | null, fetchedAt: number } | null = null
const CACHE_MS = 5 * 60 * 1000

/** Version of the Discoflare release this installer deploys (from the admin manifest). */
export default defineEventHandler(async (event): Promise<{ version: string | null }> => {
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) {
    return { version: cache.version }
  }
  const manifestUrl = installerConfig(event).adminInstallerManifestUrl
  if (typeof manifestUrl !== 'string' || !manifestUrl.startsWith('https://')) {
    return { version: null }
  }
  try {
    const response = await fetch(manifestUrl, { redirect: 'follow' })
    if (!response.ok) return { version: null }
    const manifest = await response.json() as { version?: unknown }
    const version = typeof manifest.version === 'string' && manifest.version.trim() ? manifest.version.trim() : null
    cache = { version, fetchedAt: Date.now() }
    return { version }
  }
  catch {
    return { version: null }
  }
})
