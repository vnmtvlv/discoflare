import { describe, expect, it, vi } from 'vitest'
import type { HuddleState, ScheduledHuddleDTO } from '../../shared/types'
import { signalHuddleChanged, signalScheduledHuddleReady } from '../../workers/huddle-events'

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
  const notifyHuddleSchedule = vi.fn()
  return {
    notifyHuddleChanged,
    notifyHuddleSchedule,
    env: {
      DB: { prepare: () => new Statement(results.shift()) },
      WORKSPACE_DO: {
        getByName: () => ({ notifyHuddleChanged, notifyHuddleSchedule }),
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
  scheduleId: null,
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

  it('rings both participants when their scheduled call becomes ready', async () => {
    const fake = fakeEnv([
      { id: 'dm', name: 'Alice', type: 'dm', visibility: 'private' },
      [{ id: 'caller' }, { id: 'callee' }],
    ])
    const schedule: ScheduledHuddleDTO = {
      id: 'schedule',
      channelId: 'dm',
      title: 'Catch up',
      startsAt: '2026-09-09T10:00:00.000Z',
      status: 'ready',
      createdBy: { id: 'caller', kind: 'human', displayName: 'Alice', avatarR2Key: null },
      meetingId: null,
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-09T10:00:00.000Z',
    }

    await signalScheduledHuddleReady(fake.env, schedule)

    expect(fake.notifyHuddleSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ ring: true, schedule, notification: expect.objectContaining({ title: 'Scheduled call is ready' }) }),
      ['caller', 'callee'],
    )
  })
})
