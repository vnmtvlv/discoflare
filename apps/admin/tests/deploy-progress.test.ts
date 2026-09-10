import { describe, expect, it } from 'vitest'
import { deployProgressDetail, deployProgressPercent } from '../app/utils/deploy-progress'

describe('Admin deploy progress', () => {
  it('names the current installer step and its detail', () => {
    expect(deployProgressDetail(null)).toBe('Starting')
    expect(deployProgressDetail({ type: 'progress', step: 'storage', state: 'active' })).toBe('Storage')
    expect(deployProgressDetail({
      type: 'progress',
      step: 'database',
      state: 'complete',
      detail: '3 applied',
    })).toBe('Database — 3 applied')
  })

  it('advances a determinate bar as Cloudflare steps complete', () => {
    expect(deployProgressPercent(null)).toBeGreaterThan(0)
    expect(deployProgressPercent({ type: 'progress', step: 'storage', state: 'active' }))
      .toBeLessThan(deployProgressPercent({ type: 'progress', step: 'verify', state: 'complete' }))
    expect(deployProgressPercent({ type: 'progress', step: 'verify', state: 'complete' })).toBe(100)
  })
})
