import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

if (existsSync('.env')) process.loadEnvFile('.env')

const target = process.argv.slice(2).find(argument => argument !== '--')
  ?? process.env.DISCOFLARE_DEV_PROXY_ORIGIN

if (!target) {
  console.error('Missing DISCOFLARE_DEV_PROXY_ORIGIN. Set it in .env or pass a URL after `pnpm dev:remote --`.')
  process.exit(1)
}

let origin
try {
  origin = new URL(target).origin
}
catch {
  console.error(`Invalid remote Discoflare URL: ${target}`)
  process.exit(1)
}

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
console.log(`Proxying local /api and /ws to ${origin}`)
const result = spawnSync(pnpm, ['exec', 'nuxt', 'dev'], {
  cwd: process.cwd(),
  env: { ...process.env, DISCOFLARE_DEV_PROXY_ORIGIN: origin },
  stdio: 'inherit',
})

if (result.error) throw result.error
process.exit(result.status ?? 1)
