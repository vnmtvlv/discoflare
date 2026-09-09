import { describe, expect, it } from 'vitest'
import {
  durableObjectMigrations,
  parseDeployRequest,
  releaseManifestUrl,
  type InstallerReleaseManifest,
} from '@discoflare/installer-core'

const request = {
  accountId: 'a'.repeat(32),
  workerName: 'Discoflare-HQ',
  adminEmail: 'OWNER@EXAMPLE.COM',
  allowedEmails: [],
  appName: 'HQ',
  authMode: 'builtin',
  registrationMode: 'invite_only',
  customDomainEnabled: true,
  zoneId: 'b'.repeat(32),
  zoneName: 'example.com',
  appSubdomain: 'hq',
  mailEnabled: true,
  mailSubdomain: 'hq',
  mailLocalPart: 'inbox',
} as const

describe('published installer core integration', () => {
  it('normalizes the web installer request with the shared contract', () => {
    expect(parseDeployRequest(request)).toMatchObject({
      workerName: 'discoflare-hq',
      adminEmail: 'owner@example.com',
      mailEnabled: true,
    })
  })

  it('pins requested updates to immutable GitHub Release manifests', () => {
    expect(releaseManifestUrl('v0.3.0')).toBe(
      'https://github.com/vnmtvlv/discoflare/releases/download/v0.3.0/discoflare-cloudflare-manifest.json',
    )
  })

  it('deploys the Agent Computer Durable Object on a fresh installation', () => {
    const manifest = {
      durableObjects: [
        { binding: 'AGENT_DO', className: 'DiscoflareAgent', migration: 'v3' },
      ],
    } as InstallerReleaseManifest

    expect(durableObjectMigrations(manifest, { exists: false })).toEqual({
      new_tag: 'v3',
      steps: [{ new_sqlite_classes: ['DiscoflareAgent'] }],
    })
  })
})
