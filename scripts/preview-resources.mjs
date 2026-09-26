import { spawnSync } from 'node:child_process'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const outputDirectory = join(root, '.preview')
const workerConfigPath = join(root, 'wrangler.jsonc')

function requiredEnvironment(name, minimumLength = 1) {
  const value = process.env[name]?.trim() || ''
  if (value.length < minimumLength) throw new Error(`${name} must contain at least ${minimumLength} characters`)
  return value
}

export function previewResourceNames(value) {
  const prNumber = String(value || '').trim()
  if (!/^[1-9][0-9]{0,9}$/.test(prNumber)) throw new Error('Preview PR number must be a positive integer')
  const prefix = `discoflare-preview-pr-${prNumber}`
  return {
    prNumber,
    previewName: `pr-${prNumber}`,
    databaseName: `${prefix}-db`,
    bucketName: `${prefix}-files`,
    kvNamespace: `${prefix}-tickets`,
  }
}

function wrangler(args, { allowFailure = false, quiet = false } = {}) {
  const result = spawnSync('pnpm', ['exec', 'wrangler', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  })
  const stdout = result.stdout || ''
  const stderr = result.stderr || ''
  if (!quiet && stdout.trim()) process.stdout.write(stdout)
  if (!quiet && stderr.trim()) process.stderr.write(stderr)
  if (result.error) throw result.error
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`wrangler ${args.join(' ')} failed with status ${result.status}\n${stderr || stdout}`)
  }
  return { status: result.status ?? 1, stdout, stderr }
}

function parsedJson(result, description) {
  try {
    return JSON.parse(result.stdout)
  }
  catch (error) {
    throw new Error(`Could not parse ${description} JSON: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
}

async function readProductionConfig() {
  return JSON.parse(await readFile(workerConfigPath, 'utf8'))
}

function listD1() {
  return parsedJson(wrangler(['d1', 'list', '--json'], { quiet: true }), 'D1 list')
}

function listKv() {
  return parsedJson(wrangler(['kv', 'namespace', 'list'], { quiet: true }), 'KV namespace list')
}

function databaseId(database) {
  return database.uuid || database.id
}

function ensureD1(name) {
  let database = listD1().find(candidate => candidate.name === name)
  if (!database) {
    wrangler(['d1', 'create', name])
    database = listD1().find(candidate => candidate.name === name)
  }
  const id = database && databaseId(database)
  if (!id) throw new Error(`D1 database ${name} was not returned after creation`)
  return id
}

function ensureKv(name) {
  let namespace = listKv().find(candidate => candidate.title === name)
  if (!namespace) {
    wrangler(['kv', 'namespace', 'create', name])
    namespace = listKv().find(candidate => candidate.title === name)
  }
  if (!namespace?.id) throw new Error(`KV namespace ${name} was not returned after creation`)
  return namespace.id
}

function r2Info(name) {
  const result = wrangler(['r2', 'bucket', 'info', name, '--json'], { allowFailure: true, quiet: true })
  return result.status === 0 ? parsedJson(result, `R2 bucket ${name}`) : null
}

function ensureR2(name) {
  if (!r2Info(name)) {
    const created = wrangler(['r2', 'bucket', 'create', name], { allowFailure: true })
    if (created.status !== 0 && !r2Info(name)) {
      throw new Error(`R2 bucket ${name} could not be created\n${created.stderr || created.stdout}`)
    }
  }

  const lifecycle = wrangler(['r2', 'bucket', 'lifecycle', 'list', name], { quiet: true })
  if (!lifecycle.stdout.includes('expire-preview-data')) {
    wrangler([
      'r2', 'bucket', 'lifecycle', 'add', name, 'expire-preview-data',
      '--expire-days', '1', '--abort-multipart-days', '1', '--force',
    ])
  }
}

export function buildPreviewConfigs(production, resources, ids, options = {}) {
  const preview = structuredClone(production)
  preview.previews = {
    observability: { enabled: true },
    placement: production.placement,
    vars: {
      AUTH_MODE: 'builtin',
      AUTH_REGISTRATION_MODE: 'invite_only',
      APP_NAME: `Discoflare PR #${resources.prNumber}`,
      ADMIN_EMAIL: options.adminEmail || 'preview@discoflare.invalid',
      ADMIN_NAME: 'Preview Owner',
      ADMIN_HANDLE: 'preview-owner',
      ADMIN_WORKSPACE: `PR #${resources.prNumber}`,
      DISCOFLARE_AGENT_COMPUTER_ENABLED: 'false',
      DISCOFLARE_PREVIEW: resources.previewName,
    },
    ai: production.ai,
    browser: production.browser,
    containers: production.containers,
    d1_databases: [{
      binding: 'DB',
      database_name: resources.databaseName,
      database_id: ids.databaseId,
    }],
    r2_buckets: [{ binding: 'FILES', bucket_name: resources.bucketName }],
    kv_namespaces: [{ binding: 'TICKETS', id: ids.kvNamespaceId }],
    durable_objects: production.durable_objects,
  }

  const migrations = {
    $schema: production.$schema,
    name: `${production.name}-preview-migrations`,
    compatibility_date: production.compatibility_date,
    d1_databases: [{
      binding: 'PREVIEW_DB',
      database_name: resources.databaseName,
      database_id: ids.databaseId,
      migrations_dir: 'drizzle/migrations',
    }],
  }
  return { preview, migrations }
}

async function writePreviewFiles(resources, ids) {
  const production = await readProductionConfig()
  const { preview, migrations } = buildPreviewConfigs(production, resources, ids, {
    adminEmail: process.env.DISCOFLARE_PREVIEW_ADMIN_EMAIL,
  })
  // Wrangler resolves entry points, assets, Dockerfiles, and migration folders
  // relative to the config file. Keep generated configs at the repository root
  // so the production config's existing relative paths remain valid.
  const configPath = join(root, '.wrangler.preview.generated.jsonc')
  const migrationsConfigPath = join(root, '.wrangler.preview-migrations.generated.jsonc')
  const secretsPath = join(outputDirectory, 'secrets.json')
  const manifestPath = join(outputDirectory, 'manifest.json')
  await mkdir(outputDirectory, { recursive: true })
  await writeFile(configPath, `${JSON.stringify(preview, null, 2)}\n`)
  await writeFile(migrationsConfigPath, `${JSON.stringify(migrations, null, 2)}\n`)
  await writeFile(secretsPath, `${JSON.stringify({
    AUTH_SECRET: requiredEnvironment('DISCOFLARE_PREVIEW_AUTH_SECRET', 32),
    ADMIN_PASSWORD: requiredEnvironment('DISCOFLARE_PREVIEW_ADMIN_PASSWORD', 8),
  }, null, 2)}\n`)
  await chmod(secretsPath, 0o600)
  const manifest = { ...resources, ...ids, configPath, migrationsConfigPath, secretsPath }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return { ...manifest, manifestPath, workerName: production.name }
}

async function prepare(prNumber) {
  const resources = previewResourceNames(prNumber)
  const databaseIdValue = ensureD1(resources.databaseName)
  ensureR2(resources.bucketName)
  const kvNamespaceId = ensureKv(resources.kvNamespace)
  const manifest = await writePreviewFiles(resources, { databaseId: databaseIdValue, kvNamespaceId })
  console.log(JSON.stringify(manifest))
}

function missingResource(output) {
  return /not found|does not exist|could not find|unknown preview/i.test(output)
}

function deletePreview(resources, workerName) {
  const result = wrangler([
    'preview', 'delete', '--name', resources.previewName,
    '--worker-name', workerName, '--skip-confirmation', '--config', workerConfigPath,
  ], { allowFailure: true })
  if (result.status !== 0 && !missingResource(`${result.stdout}\n${result.stderr}`)) {
    throw new Error(`Could not delete Preview ${resources.previewName}`)
  }
}

function deletePreviewContainers(resources, workerName) {
  const containers = parsedJson(
    wrangler(['containers', 'list', '--json', '--per-page', '100'], { quiet: true }),
    'container list',
  )
  const prefix = `${workerName}_${resources.previewName}_`
  for (const container of containers.filter(candidate => candidate.name?.startsWith(prefix))) {
    if (!container.id) throw new Error(`Container ${container.name} has no id`)
    wrangler(['containers', 'delete', container.id])
  }
}

function objectCount(info) {
  return Number.parseInt(String(info?.object_count || '0').replaceAll(',', ''), 10) || 0
}

function deleteDataResources(resources) {
  const bucket = r2Info(resources.bucketName)
  if (bucket && objectCount(bucket) > 0) {
    console.log(`R2 bucket ${resources.bucketName} still contains ${bucket.object_count} object(s); lifecycle cleanup is pending`)
    return false
  }
  if (bucket) wrangler(['r2', 'bucket', 'delete', resources.bucketName])

  const namespace = listKv().find(candidate => candidate.title === resources.kvNamespace)
  if (namespace) wrangler(['kv', 'namespace', 'delete', '--namespace-id', namespace.id, '--skip-confirmation'])

  const database = listD1().find(candidate => candidate.name === resources.databaseName)
  if (database) wrangler(['d1', 'delete', resources.databaseName, '--skip-confirmation'])
  return true
}

async function cleanup(prNumber) {
  const resources = previewResourceNames(prNumber)
  const production = await readProductionConfig()
  deletePreview(resources, production.name)
  deletePreviewContainers(resources, production.name)
  const complete = deleteDataResources(resources)
  console.log(JSON.stringify({ prNumber: resources.prNumber, complete }))
}

function previewPrNumbers() {
  const pattern = /^discoflare-preview-pr-([1-9][0-9]{0,9})-db$/
  return listD1()
    .map(database => database.name?.match(pattern)?.[1])
    .filter(Boolean)
}

async function sweep() {
  const open = new Set((process.env.DISCOFLARE_OPEN_PREVIEW_PRS || '').split(',').filter(Boolean))
  for (const prNumber of previewPrNumbers()) {
    if (!open.has(prNumber)) await cleanup(prNumber)
  }
}

async function main() {
  const [command, argument] = process.argv.slice(2)
  if (command === 'prepare') return prepare(argument || process.env.DISCOFLARE_PREVIEW_PR)
  if (command === 'cleanup') return cleanup(argument || process.env.DISCOFLARE_PREVIEW_PR)
  if (command === 'sweep') return sweep()
  throw new Error('Usage: preview-resources.mjs <prepare|cleanup|sweep> [pr-number]')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
