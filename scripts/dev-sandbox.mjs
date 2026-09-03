import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envFile = resolve('.env.sandbox')
const generatedDir = resolve('.wrangler/discoflare-sandbox')
const generatedConfig = resolve(generatedDir, 'wrangler.generated.json')
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

if (!existsSync(envFile)) {
  console.error('Missing .env.sandbox. Copy .env.sandbox.example and fill the sandbox resource values.')
  process.exit(1)
}

const rawEnv = readFileSync(envFile, 'utf8')
const forbiddenCredentials = [
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_API_KEY',
  'CLOUDFLARE_EMAIL',
].filter(key => new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`, 'm').test(rawEnv))

if (forbiddenCredentials.length) {
  console.error(`Remove Cloudflare login credentials from .env.sandbox: ${forbiddenCredentials.join(', ')}`)
  console.error('Use `wrangler login` or export a short-lived token in the shell instead.')
  process.exit(1)
}

process.loadEnvFile(envFile)

const required = [
  'CLOUDFLARE_ACCOUNT_ID',
  'DISCOFLARE_SANDBOX_WORKER_NAME',
  'DISCOFLARE_SANDBOX_D1_DATABASE_NAME',
  'DISCOFLARE_SANDBOX_D1_DATABASE_ID',
  'DISCOFLARE_SANDBOX_R2_BUCKET_NAME',
  'DISCOFLARE_SANDBOX_KV_NAMESPACE_ID',
  'AUTH_SECRET',
]
const missing = required.filter(key => !process.env[key]?.trim())

if (missing.length) {
  console.error(`Missing required .env.sandbox values: ${missing.join(', ')}`)
  process.exit(1)
}

const sandboxWorker = process.env.DISCOFLARE_SANDBOX_WORKER_NAME.trim()
const d1Id = process.env.DISCOFLARE_SANDBOX_D1_DATABASE_ID.trim()
const r2Bucket = process.env.DISCOFLARE_SANDBOX_R2_BUCKET_NAME.trim()
const kvId = process.env.DISCOFLARE_SANDBOX_KV_NAMESPACE_ID.trim()

const config = {
  name: 'discoflare-sandbox-local-dev',
  account_id: process.env.CLOUDFLARE_ACCOUNT_ID.trim(),
  compatibility_date: '2026-09-02',
  compatibility_flags: ['nodejs_compat'],
  d1_databases: [{
    binding: 'DB',
    database_name: process.env.DISCOFLARE_SANDBOX_D1_DATABASE_NAME.trim(),
    database_id: d1Id,
    preview_database_id: d1Id,
  }],
  r2_buckets: [{
    binding: 'FILES',
    bucket_name: r2Bucket,
    preview_bucket_name: r2Bucket,
  }],
  kv_namespaces: [{
    binding: 'TICKETS',
    id: kvId,
    preview_id: kvId,
  }],
  durable_objects: {
    bindings: [
      { name: 'CHANNEL_DO', class_name: 'ChannelDurableObject', script_name: sandboxWorker },
      { name: 'WORKSPACE_DO', class_name: 'WorkspaceDurableObject', script_name: sandboxWorker },
      { name: 'RATE_LIMIT_DO', class_name: 'RateLimitDurableObject', script_name: sandboxWorker },
    ],
  },
}

mkdirSync(generatedDir, { recursive: true })
writeFileSync(generatedConfig, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })

function run(args) {
  const result = spawnSync(pnpm, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run(['exec', 'wrangler', 'whoami'])
run(['exec', 'nuxt', 'build', '--dotenv', '.env.sandbox'])
run([
  'exec',
  'wrangler',
  'dev',
  '.output/server/index.mjs',
  '--assets',
  '.output/public',
  '--config',
  generatedConfig,
  '--env-file',
  envFile,
  '--port',
  '3000',
  '--remote',
])
