import { pathToFileURL } from 'node:url'

export function assertWorkersBuild(env) {
  if (env.WORKERS_CI !== '1' || env.WORKERS_CI_BRANCH !== 'main') {
    throw new Error('Production deploys are only allowed from Cloudflare Workers Builds on main.')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertWorkersBuild(process.env)
}
