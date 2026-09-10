import { pathToFileURL } from 'node:url'

export function assertWorkersBuild(env) {
  if (env.WORKERS_CI === '1' && env.WORKERS_CI_BRANCH === 'main') return
  if (env.DISCOFLARE_RELEASE_DEPLOY === '1') return
  throw new Error('Production deploys are only allowed from Cloudflare Workers Builds on main or the release deploy workflow.')
}
