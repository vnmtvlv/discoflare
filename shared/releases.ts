export type PublishedRelease = {
  tagName: string
  name: string
  publishedAt: string
  url: string
  notes: string
}

export type UpdateStatusDTO = {
  installedVersion: string
  installationKind: 'guided' | 'manual'
  latestRelease: PublishedRelease | null
  releasesBehind: number
  updateAvailable: boolean
  upgradeUrl: string | null
  checkedAt: string
  checkFailed: boolean
}

type Semver = readonly [major: number, minor: number, patch: number]

const DISCOFLARE_RELEASES_URL = 'https://github.com/vnmtvlv/discoflare/releases/tag'

export function discoflareReleaseUrl(version: string): string {
  const tag = version.trim().replace(/^v/, '')
  return `${DISCOFLARE_RELEASES_URL}/v${tag}`
}

export function stableSemver(value: string): Semver | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value.trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export function compareStableVersions(left: string, right: string): number {
  const a = stableSemver(left)
  const b = stableSemver(right)
  if (!a || !b) return 0
  for (let index = 0; index < a.length; index += 1) {
    if (a[index]! !== b[index]!) return a[index]! - b[index]!
  }
  return 0
}

export function newerStableReleases(installedVersion: string, releases: PublishedRelease[]): PublishedRelease[] {
  if (!stableSemver(installedVersion)) return []
  return releases
    .filter(release => stableSemver(release.tagName) && compareStableVersions(release.tagName, installedVersion) > 0)
    .sort((left, right) => compareStableVersions(right.tagName, left.tagName))
}
