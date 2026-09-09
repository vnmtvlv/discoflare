type ReleaseManifest = { version?: unknown }

export async function latestWorkspaceVersion(event: Parameters<typeof useRuntimeConfig>[0]) {
  const config = useRuntimeConfig(event)
  const response = await fetch(String(config.workspaceManifestUrl), { redirect: 'follow' })
  if (!response.ok) return null
  const manifest = await response.json() as ReleaseManifest
  return typeof manifest.version === 'string' ? manifest.version : null
}
