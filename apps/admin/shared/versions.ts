function parts(version: string) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(version)
  return match ? match.slice(1).map(Number) : null
}

export function isNewerRelease(currentVersion: string | null, latestVersion: string | null) {
  if (!latestVersion) return false
  if (!currentVersion) return true
  const current = parts(currentVersion)
  const latest = parts(latestVersion)
  if (!current || !latest) return false
  for (let index = 0; index < current.length; index += 1) {
    if (latest[index]! > current[index]!) return true
    if (latest[index]! < current[index]!) return false
  }
  return false
}
