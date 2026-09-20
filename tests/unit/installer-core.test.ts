import { describe, expect, it } from 'vitest'
import {
  agentComputerDeploymentMetadata,
  durableObjectMigrations,
  InstallerError,
  parseDeployRequest,
  requiresReadyVerification,
  requiresInitialInfrastructureProvisioning,
  realtimeKitAvPreset,
  realtimeKitPreset,
  verifyDeployment,
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
  agentComputerEnabled: true,
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
  capabilities: ['managed-realtimekit-v1'],
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

  it('accepts pre-release versions as explicit install targets', () => {
    expect(parseDeployRequest({ ...request, targetVersion: 'v0.10.0-rc.1' }).targetVersion).toBe('v0.10.0-rc.1')
    expect(parseDeployRequest({ ...request, targetVersion: '0.10.0' }).targetVersion).toBe('0.10.0')
    expect(() => parseDeployRequest({ ...request, targetVersion: 'latest' })).toThrow('Invalid Discoflare release version')
    expect(() => parseDeployRequest({ ...request, targetVersion: '../v0.10.0' })).toThrow('Invalid Discoflare release version')
  })

  it('normalizes managed RealtimeKit as an explicit opt-in', () => {
    expect(parseDeployRequest({ ...request, realtimekitEnabled: true }).realtimekitEnabled).toBe(true)
    expect(parseDeployRequest({ ...request, realtimekitEnabled: 'yes' }).realtimekitEnabled).toBe(false)
  })

  it('defaults omitted Agent Computer preference to the full profile', () => {
    const { agentComputerEnabled: _agentComputerEnabled, ...requestWithoutComputer } = request
    expect(parseDeployRequest(requestWithoutComputer).agentComputerEnabled).toBe(true)
    expect(parseDeployRequest({ ...request, agentComputerEnabled: false }).agentComputerEnabled).toBe(false)
  })

  it('omits paid Worker resources from the base Installation metadata', () => {
    expect(agentComputerDeploymentMetadata({ ...request, agentComputerEnabled: false }, manifest)).toEqual({
      bindings: [],
      containers: undefined,
    })
    expect(agentComputerDeploymentMetadata(request, manifest)).toMatchObject({
      bindings: [{ type: 'workflow', name: 'AGENT_TASK_WORKFLOW' }],
      containers: [{ name: 'discoflare-hq-computer' }],
    })
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

  it('does not require a new owner-setup installation to be ready after an update', () => {
    expect(requiresReadyVerification(true, 'builtin', {
      version: '0.7.1',
      ok: true,
      ready: false,
      users: 0,
      migrated: true,
      ownerSetup: true,
    })).toBe(false)
  })

  it('keeps ready verification for claimed and unknown builtin installations', () => {
    expect(requiresReadyVerification(true, 'builtin', {
      ready: true,
      users: 1,
      ownerSetup: false,
    })).toBe(true)
    expect(requiresReadyVerification(true, 'builtin', null)).toBe(true)
    expect(requiresReadyVerification(true, 'access', null)).toBe(false)
  })

  it('keeps retrying while a newly activated Worker temporarily returns 404', async () => {
    let calls = 0
    const fetchHealth = async () => {
      calls += 1
      if (calls <= 15) return new Response(null, { status: 404 })
      return Response.json({
        version: '0.7.4',
        ok: true,
        ready: false,
        migrated: true,
        realtimekit: true,
      })
    }

    await expect(verifyDeployment('https://workspace.example.com', '0.7.4', false, true, undefined, {
      fetch: fetchHealth,
      wait: async () => {},
    })).resolves.toBe(true)
    expect(calls).toBe(16)
  })

})
