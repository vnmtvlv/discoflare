import { describe, expect, it } from 'vitest'
import { compareStableVersions, newerStableReleases, stableSemver, type PublishedRelease } from '../../shared/releases'

function release(tagName: string): PublishedRelease {
  return { tagName, name: tagName, publishedAt: '2026-09-05T00:00:00Z', url: `https://example.com/${tagName}`, notes: '' }
}

describe('release versions', () => {
  it('accepts stable tags and rejects prereleases', () => {
    expect(stableSemver('v0.1.3')).toEqual([0, 1, 3])
    expect(stableSemver('0.1.3')).toEqual([0, 1, 3])
    expect(stableSemver('v0.2.0-rc.1')).toBeNull()
  })

  it('compares numeric version parts', () => {
    expect(compareStableVersions('0.10.0', '0.9.9')).toBeGreaterThan(0)
    expect(compareStableVersions('v1.0.0', '0.99.99')).toBeGreaterThan(0)
    expect(compareStableVersions('0.1.3', 'v0.1.3')).toBe(0)
  })

  it('counts and orders every published stable release after the installation', () => {
    const newer = newerStableReleases('0.0.3', [
      release('v0.1.2'),
      release('v0.0.2'),
      release('v0.1.0'),
      release('v0.1.3'),
      release('v0.1.1'),
      release('v0.2.0-rc.1'),
    ])
    expect(newer.map(item => item.tagName)).toEqual(['v0.1.3', 'v0.1.2', 'v0.1.1', 'v0.1.0'])
  })
})
