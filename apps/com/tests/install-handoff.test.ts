import { describe, expect, it } from 'vitest'
import { activeInstallHandoff } from '../server/utils/installer-session'

const handoff = {
  accountId: 'a'.repeat(32),
  accountName: 'Discoflare Dev',
  origin: 'https://discoflare-admin.example.workers.dev',
  workerName: 'discoflare-admin',
  version: '0.9.4-test',
  handoffUrl: 'https://discoflare-admin.example.workers.dev/bootstrap#token=abc',
  expiresAt: 1_000,
}

describe('installer install handoff', () => {
  it('returns the resumable handoff while its token is valid', () => {
    expect(activeInstallHandoff(handoff, 999)).toEqual({
      accountId: handoff.accountId,
      accountName: handoff.accountName,
      origin: handoff.origin,
      workerName: handoff.workerName,
      version: handoff.version,
      handoffUrl: handoff.handoffUrl,
    })
  })

  it('drops the handoff once the token expires', () => {
    expect(activeInstallHandoff(handoff, 1_000)).toBeNull()
    expect(activeInstallHandoff(handoff, 2_000)).toBeNull()
  })

  it('returns nothing without a stored handoff', () => {
    expect(activeInstallHandoff(undefined, 999)).toBeNull()
  })
})
