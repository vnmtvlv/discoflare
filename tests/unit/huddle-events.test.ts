import { describe, expect, it, vi } from 'vitest'
import type { HuddleState } from '../../shared/types'
import { signalHuddleChanged } from '../../workers/huddle-events'

class Statement {
  args: unknown[] = []

  constructor(private readonly result: unknown) {}

  bind(...args: unknown[]) {
    this.args = args
    return this
  }

  async first<T>() {
    return this.result as T | null
  }

  async all<T>() {
    return { results: this.result as T[] }
  }
}

function fakeEnv(results: unknown[]) {
  const notifyHuddleChanged = vi.fn()
  return {
    notifyHuddleChanged,
    env: {
      DB: { prepare: () => new Statement(results.shift()) },
      WORKSPACE_DO: {
        getByName: () => ({ notifyHuddleChanged }),
      },
    } as never,
  }
}

const activeCall: HuddleState = {
  active: true,
  huddleId: 'meeting',
  meetingId: 'meeting',
  participantIds: ['caller'],
  startedBy: 'caller',
  startedAt: '2026-09-08T10:00:00.000Z',
  kind: 'call',
  title: null,
}

describe('workspace huddle events', () => {
  it('rings only the other participant for a live one-to-one call', async () => {
    const fake = fakeEnv([
      { id: 'dm', name: 'Alice', type: 'dm', visibility: 'private' },
      [{ id: 'caller' }, { id: 'callee' }],
    ])

    await signalHuddleChanged(fake.env, 'dm', activeCall, {
      id: 'caller', kind: 'human', displayName: 'Alice', avatarR2Key: null,
    })

    expect(fake.notifyHuddleChanged).toHaveBeenCalledWith(
      expect.objectContaining({ ring: true, notification: expect.objectContaining({ title: 'Alice is calling' }) }),
      ['callee'],
    )
  })
})
