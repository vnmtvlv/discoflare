type ReleaseManifest = { version?: unknown }

async function latestReleaseVersion(manifestUrl: unknown) {
  const response = await fetch(String(manifestUrl), { redirect: 'follow' })
  if (!response.ok) return null
  const manifest = await response.json() as ReleaseManifest
  return typeof manifest.version === 'string' ? manifest.version : null
}

export function latestWorkspaceVersion(event: Parameters<typeof useRuntimeConfig>[0]) {
  return latestReleaseVersion(useRuntimeConfig(event).workspaceManifestUrl)
}

export function latestAdminVersion(event: Parameters<typeof useRuntimeConfig>[0]) {
  return latestReleaseVersion(useRuntimeConfig(event).adminManifestUrl)
}
