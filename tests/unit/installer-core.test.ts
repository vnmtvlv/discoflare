import { describe, expect, it } from 'vitest'
import {
  durableObjectMigrations,
  InstallerError,
  parseDeployRequest,
  requiresInitialInfrastructureProvisioning,
  realtimeKitAvPreset,
  realtimeKitPreset,
} from '../../packages/installer-core/src/index'
import type { InstallerReleaseManifest } from '../../packages/installer-core/src/index'

const request = {
  accountId: 'a'.repeat(32),
  workerName: 'discoflare-hq',
  adminEmail: 'owner@example.com',
  allowedEmails: [],
  appName: 'Discoflare HQ',
  authMode: 'builtin',
  registrationMode: 'invite_only',
  customDomainEnabled: true,
  zoneId: 'b'.repeat(32),
  zoneName: 'example.com',
  appSubdomain: 'hq',
  mailEnabled: true,
  mailSubdomain: 'hq',
  mailLocalPart: 'inbox',
  realtimekitEnabled: false,
  realtimekitApiToken: '',
} as const

const manifest = {
  schemaVersion: 1,
  version: '0.3.0',
  releasedAt: '2026-09-07T00:00:00.000Z',
  compatibilityDate: '2026-09-02',
  compatibilityFlags: ['nodejs_compat'],
  worker: { url: 'https://example.com/worker', sha256: 'a', size: 1 },
  assets: { url: 'https://example.com/assets', sha256: 'b', size: 1 },
  container: { image: 'ghcr.io/vnmtvlv/discoflare-computer:0.3.0', className: 'DiscoflareAgent', instanceType: 'lite', maxInstances: 10 },
  durableObjects: [
    { binding: 'CHANNEL_DO', className: 'ChannelDurableObject', migration: 'v1' },
    { binding: 'AGENT_DO', className: 'DiscoflareAgent', migration: 'v3' },
    { binding: 'AGENT_THINK', className: 'DiscoflareThink', migration: 'v4' },
  ],
  workflow: { binding: 'AGENT_TASK_WORKFLOW', className: 'AgentTaskWorkflow' },
} satisfies InstallerReleaseManifest

describe('installer-core', () => {
  it('normalizes a complete deployment request', () => {
    expect(parseDeployRequest({ ...request, workerName: 'Discoflare-HQ', adminEmail: 'OWNER@EXAMPLE.COM' })).toMatchObject({
      workerName: 'discoflare-hq',
      adminEmail: 'owner@example.com',
    })
  })

  it('rejects an invalid Cloudflare target before mutation', () => {
    expect(() => parseDeployRequest({ ...request, accountId: 'wrong' })).toThrow(InstallerError)
  })

  it('normalizes managed RealtimeKit as an explicit opt-in', () => {
    expect(parseDeployRequest({ ...request, realtimekitEnabled: true }).realtimekitEnabled).toBe(true)
    expect(parseDeployRequest({ ...request, realtimekitEnabled: 'yes' }).realtimekitEnabled).toBe(false)
  })

  it('creates a huddle preset without recording or RealtimeKit chat', () => {
    const preset = realtimeKitPreset(realtimeKitAvPreset, true)
    expect(preset.config.view_type).toBe('GROUP_CALL')
    expect(preset.permissions.media.video.can_produce).toBe('ALLOWED')
    expect(preset.permissions.media.screenshare.can_produce).toBe('ALLOWED')
    expect(preset.permissions.can_record).toBe(false)
    expect(preset.permissions.transcription_enabled).toBe(false)
    expect(preset.permissions.chat.public.can_send).toBe(false)
  })

  it('groups fresh Durable Object migrations in release order', () => {
    expect(durableObjectMigrations(manifest, { exists: false })).toEqual({
      new_tag: 'v4',
      steps: [
        { new_sqlite_classes: ['ChannelDurableObject'] },
        { new_sqlite_classes: ['DiscoflareAgent'] },
        { new_sqlite_classes: ['DiscoflareThink'] },
      ],
    })
  })

  it('does not emit a migration when an installation is current', () => {
    expect(durableObjectMigrations(manifest, { exists: true, migrationTag: 'v4' })).toBeUndefined()
  })

  it('does not reprovision domain and mail infrastructure during an upgrade', () => {
    expect(requiresInitialInfrastructureProvisioning(true)).toBe(false)
    expect(requiresInitialInfrastructureProvisioning(false)).toBe(true)
  })
})
