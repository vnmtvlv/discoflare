import { describe, expect, it } from 'vitest'
import { buildPreviewConfigs, previewResourceNames } from '../../scripts/preview-resources.mjs'
import { previewComment, previewDeployment } from '../../scripts/preview-report.mjs'

const production = {
  $schema: 'node_modules/wrangler/config-schema.json',
  name: 'discoflare-sandbox',
  main: '.output/server/index.mjs',
  compatibility_date: '2026-09-02',
  compatibility_flags: ['nodejs_compat'],
  preview_urls: true,
  routes: [{ pattern: 'sandbox.discoflare.com', custom_domain: true }],
  triggers: { crons: ['17 4 * * 1'] },
  placement: { mode: 'smart' },
  ai: { binding: 'AI' },
  browser: { binding: 'BROWSER' },
  workflows: [{ binding: 'AGENT_TASK_WORKFLOW', name: 'production-workflow', class_name: 'AgentTaskWorkflow' }],
  containers: [{ class_name: 'DiscoflareAgent', image: './Dockerfile.computer', instance_type: 'lite' }],
  d1_databases: [{ binding: 'DB', database_name: 'production-db', database_id: 'production-d1' }],
  r2_buckets: [{ binding: 'FILES', bucket_name: 'production-files' }],
  kv_namespaces: [{ binding: 'TICKETS', id: 'production-kv' }],
  durable_objects: { bindings: [{ name: 'CHANNEL_DO', class_name: 'ChannelDurableObject' }] },
  vars: { PUBLIC_ORIGIN: 'https://sandbox.discoflare.com' },
}

describe('Worker Preview resources', () => {
  it('derives every resource from one validated PR number', () => {
    expect(previewResourceNames('42')).toEqual({
      prNumber: '42',
      previewName: 'pr-42',
      databaseName: 'discoflare-preview-pr-42-db',
      bucketName: 'discoflare-preview-pr-42-files',
      kvNamespace: 'discoflare-preview-pr-42-tickets',
    })
    expect(() => previewResourceNames('feature/login')).toThrow('positive integer')
    expect(() => previewResourceNames('0')).toThrow('positive integer')
  })

  it('extracts stable and immutable URLs from current Wrangler JSON', () => {
    const deployment = previewDeployment({
      preview_name: 'pr-42',
      preview_urls: ['https://pr-42.example.workers.dev'],
      deployment_id: 'deployment-1',
      deployment_urls: ['https://deployment-1.example.workers.dev'],
    })
    expect(deployment).toEqual({
      previewName: 'pr-42',
      previewUrl: 'https://pr-42.example.workers.dev',
      deploymentUrl: 'https://deployment-1.example.workers.dev',
      deploymentId: 'deployment-1',
    })
    expect(previewComment(deployment, 'abc123')).toContain('Exact deployment: https://deployment-1.example.workers.dev')
  })

  it('binds Preview-safe resources without inheriting production Workflow or data', () => {
    const resources = previewResourceNames('42')
    const { preview, migrations } = buildPreviewConfigs(production, resources, {
      databaseId: 'preview-d1',
      kvNamespaceId: 'preview-kv',
    })

    expect(preview.previews).toMatchObject({
      vars: {
        AUTH_MODE: 'builtin',
        AUTH_REGISTRATION_MODE: 'invite_only',
        DISCOFLARE_AGENT_COMPUTER_ENABLED: 'false',
        DISCOFLARE_PREVIEW: 'pr-42',
      },
      d1_databases: [{ binding: 'DB', database_name: resources.databaseName, database_id: 'preview-d1' }],
      r2_buckets: [{ binding: 'FILES', bucket_name: resources.bucketName }],
      kv_namespaces: [{ binding: 'TICKETS', id: 'preview-kv' }],
      containers: production.containers,
      durable_objects: production.durable_objects,
    })
    expect(preview.previews).not.toHaveProperty('workflows')
    expect(preview.previews).not.toHaveProperty('secrets')
    expect(JSON.stringify(preview.previews)).not.toContain('production-d1')
    expect(JSON.stringify(preview.previews)).not.toContain('production-files')
    expect(JSON.stringify(preview.previews)).not.toContain('production-kv')
    expect(JSON.stringify(preview.previews)).not.toContain('sandbox.discoflare.com')
    expect(migrations.d1_databases).toEqual([{
      binding: 'PREVIEW_DB',
      database_name: resources.databaseName,
      database_id: 'preview-d1',
      migrations_dir: 'drizzle/migrations',
    }])
  })
})
