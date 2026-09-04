import { spawnSync } from 'node:child_process'

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const result = spawnSync(pnpm, ['exec', 'nuxt', 'generate'], {
  cwd: process.cwd(),
  env: { ...process.env, DISCOFLARE_CLIENT_MODE: 'native' },
  stdio: 'inherit',
})

if (result.error) throw result.error
process.exit(result.status ?? 1)
