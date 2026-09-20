import { describe, expect, it } from 'vitest'
import { canRunTask, canSetTaskStatus } from '../../shared/task-status'

describe('task lifecycle', () => {
  it('reserves running for the workflow boundary', () => {
    expect(canSetTaskStatus('ready', 'running')).toBe(false)
    expect(canSetTaskStatus('running', 'done')).toBe(false)
    expect(canSetTaskStatus('review', 'done')).toBe(true)
  })

  it('runs open work but requires completed work to be reopened', () => {
    expect(canRunTask('backlog')).toBe(true)
    expect(canRunTask('failed')).toBe(true)
    expect(canRunTask('running')).toBe(false)
    expect(canRunTask('done')).toBe(false)
  })
})
