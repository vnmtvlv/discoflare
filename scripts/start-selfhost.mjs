import { mkdir, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const required = ['PUBLIC_ORIGIN', 'AUTH_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_NAME']
const forwarded = [
  ...required,
  'ADMIN_HANDLE',
  'ADMIN_WORKSPACE',
  'APP_NAME',
  'APP_TITLE',
  'APP_SUBTITLE',
  'AUTH_REGISTRATION_MODE',
  'EMAIL_FROM',
  'EMAIL_FROM_NAME',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'TWITTER_CLIENT_ID',
  'TWITTER_CLIENT_SECRET',
  'TELEGRAM_CLIENT_ID',
  'TELEGRAM_CLIENT_SECRET',
  'TURNSTILE_SITE_KEY',
  'TURNSTILE_SECRET_KEY',
  'VAPID_SUBJECT',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'REALTIMEKIT_ACCOUNT_ID',
  'REALTIMEKIT_APP_ID',
  'REALTIMEKIT_API_KEY',
  'REALTIMEKIT_API_SECRET',
  'REALTIMEKIT_PRESET_VOICE',
  'REALTIMEKIT_PRESET_AV',
]

for (const key of required) {
  if (!process.env[key]?.trim()) {
    throw new Error(`${key} is required`)
  }
}

if (process.env.AUTH_SECRET.length < 32) {
  throw new Error('AUTH_SECRET must be at least 32 characters')
}

const port = process.env.PORT || '3000'
const dataDir = process.env.DISCOFLARE_DATA_DIR || '/data'
const envDir = '/tmp/discoflare'
const envFile = `${envDir}/runtime.env`
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url))

await mkdir(dataDir, { recursive: true })
await mkdir(envDir, { recursive: true })
await writeFile(
  envFile,
  `${forwarded
    .filter(key => process.env[key] !== undefined)
    .map(key => `${key}=${JSON.stringify(process.env[key])}`)
    .join('\n')}\n`,
  { mode: 0o600 },
)

function runWrangler(args, options = {}) {
  return spawn(process.execPath, [wrangler, ...args], {
    stdio: 'inherit',
    env: { ...process.env, CI: 'true' },
    ...options,
  })
}

function waitFor(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      resolve({ code, signal })
    })
  })
}

const migration = runWrangler([
  'd1',
  'migrations',
  'apply',
  'DB',
  '--local',
  '--config',
  'wrangler.dev.jsonc',
  '--persist-to',
  dataDir,
])
const migrationExit = await waitFor(migration)
if (migrationExit.code !== 0) {
  throw new Error(`D1 migration exited with ${migrationExit.signal || migrationExit.code}`)
}

const server = runWrangler([
  'dev',
  '.output/server/index.mjs',
  '--assets',
  '.output/public',
  '--config',
  'wrangler.dev.jsonc',
  '--env-file',
  envFile,
  '--local',
  '--ip',
  '0.0.0.0',
  '--port',
  port,
  '--persist-to',
  dataDir,
  '--no-latest',
  '--show-interactive-dev-session=false',
  '--log-level',
  'info',
])

let stopping = false
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    stopping = true
    server.kill(signal)
  })
}

try {
  const serverExit = await waitFor(server)
  if (serverExit.code !== 0 && !stopping) {
    throw new Error(`Discoflare exited with ${serverExit.signal || serverExit.code}`)
  }
}
finally {
  await rm(envFile, { force: true })
}
