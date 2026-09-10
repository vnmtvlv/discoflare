import { describe, expect, it } from 'vitest'
import { assertWorkersBuild } from '../scripts/assert-workers-build.mjs'

describe('production deployment boundary', () => {
  it('accepts Cloudflare Workers Builds on main', () => {
    expect(() => assertWorkersBuild({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' })).not.toThrow()
  })

  it('accepts the release deploy workflow', () => {
    expect(() => assertWorkersBuild({ DISCOFLARE_RELEASE_DEPLOY: '1' })).not.toThrow()
  })

  it('rejects local and non-production deployment attempts', () => {
    expect(() => assertWorkersBuild({})).toThrow('only allowed from Cloudflare Workers Builds on main')
    expect(() => assertWorkersBuild({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'preview' })).toThrow('only allowed from Cloudflare Workers Builds on main')
  })
})
