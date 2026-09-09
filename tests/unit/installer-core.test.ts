import { describe, expect, it } from 'vitest'
import {
  accountAdminTokenTemplateUrl,
  adminReleaseManifestUrl,
  deriveAdminCapability,
  durableObjectMigrations,
  InstallerError,
  instanceAdminPermissionTemplate,
  instanceAdminTokenTemplateUrl,
  parseDeployRequest,
  proxyAdminRealtimeKit,
  requiresInitialInfrastructureProvisioning,
  realtimeKitAvPreset,
  realtimeKitPreset,
} from '../../packages/installer-core/src/index'
import type { InstallerReleaseManifest } from '../../packages/installer-core/src/index'

const request = {
  accountId: 'a'.repeat(32),
  workerName: 'discoflare-hq',
  managementMode: 'manual',
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
  capabilities: ['discoflare-admin-v1'],
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

  it('defaults older installer requests to manual management', () => {
    const { managementMode: _managementMode, ...legacyRequest } = request
    expect(parseDeployRequest(legacyRequest).managementMode).toBe('manual')
  })

  it('accepts managed installation ownership explicitly', () => {
    expect(parseDeployRequest({ ...request, managementMode: 'managed', instanceAdminToken: '  secret-token  ' })).toMatchObject({
      managementMode: 'managed',
      instanceAdminToken: 'secret-token',
    })
    expect(() => parseDeployRequest({ ...request, managementMode: 'automatic' })).toThrow(InstallerError)
  })

  it('normalizes Discoflare Admin management without accepting an invalid origin', () => {
    expect(parseDeployRequest({
      ...request,
      managementMode: 'admin',
      adminOrigin: 'https://discoflare-admin.example.workers.dev',
      adminWorkerName: 'discoflare-admin',
    })).toMatchObject({
      managementMode: 'admin',
      adminOrigin: 'https://discoflare-admin.example.workers.dev',
      adminWorkerName: 'discoflare-admin',
    })
    expect(() => parseDeployRequest({ ...request, managementMode: 'admin' })).toThrow(InstallerError)
    expect(() => parseDeployRequest({
      ...request,
      managementMode: 'admin',
      adminOrigin: 'http://localhost:3000',
      adminWorkerName: 'discoflare-admin',
    })).toThrow(InstallerError)
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

  it('builds an account-token template from an explicit permission allowlist', () => {
    const url = new URL(instanceAdminTokenTemplateUrl(request.workerName))
    expect(url.origin).toBe('https://dash.cloudflare.com')
    expect(url.searchParams.get('to')).toBe('/:account/api-tokens')
    expect(JSON.parse(url.searchParams.get('permissionGroupKeys')!)).toEqual(instanceAdminPermissionTemplate)
    expect(instanceAdminPermissionTemplate.some(permission => permission.key === 'billing')).toBe(false)
  })

  it('builds one account-admin token template and scoped installation capabilities', async () => {
    const url = new URL(accountAdminTokenTemplateUrl())
    expect(url.searchParams.get('name')).toBe('Discoflare Admin')
    expect(await deriveAdminCapability('account-token', request.accountId, 'workspace-a'))
      .toBe(await deriveAdminCapability('account-token', request.accountId, 'workspace-a'))
    expect(await deriveAdminCapability('account-token', request.accountId, 'workspace-a'))
      .not.toBe(await deriveAdminCapability('account-token', request.accountId, 'workspace-b'))
  })

  it('resolves Discoflare Admin from the same versioned release as the workspace', () => {
    expect(adminReleaseManifestUrl()).toBe('https://github.com/vnmtvlv/discoflare/releases/latest/download/discoflare-admin-cloudflare-manifest.json')
    expect(adminReleaseManifestUrl('v0.7.1')).toContain('/discoflare/releases/download/v0.7.1/')
  })

  it('rejects RealtimeKit operations outside the Admin allowlist before provider access', async () => {
    await expect(proxyAdminRealtimeKit('account-token', 'capability', {
      accountId: request.accountId,
      workerName: request.workerName,
      appId: '019c8d30-bf29-7000-8000-000000000001',
      method: 'DELETE',
      path: '/meetings/all',
    })).rejects.toThrow('RealtimeKit operation is invalid')
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
