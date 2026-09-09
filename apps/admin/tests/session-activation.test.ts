import { describe, expect, it, vi } from 'vitest'
import { waitForConnectedSession } from '../app/utils/session-activation'

describe('Admin token activation', () => {
  it('keeps refreshing while the new Worker version activates', async () => {
    let connected = false
    let refreshCount = 0
    const wait = vi.fn(async () => {})

    await waitForConnectedSession({
      refresh: async () => {
        refreshCount += 1
        connected = refreshCount === 3
      },
      isConnected: () => connected,
      wait,
      attempts: 5,
      delayMs: 100,
    })

    expect(refreshCount).toBe(3)
    expect(wait).toHaveBeenCalledTimes(2)
  })

  it('reports an activation timeout instead of silently staying disconnected', async () => {
    await expect(waitForConnectedSession({
      refresh: async () => {},
      isConnected: () => false,
      wait: async () => {},
      attempts: 2,
      delayMs: 100,
    })).rejects.toThrow('still activating')
  })
})
