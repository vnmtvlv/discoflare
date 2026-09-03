import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import type { useSessionStore as SessionStoreFactory } from '../../app/stores/session'

let useSessionStore: typeof SessionStoreFactory

beforeAll(async () => {
  vi.stubGlobal('ref', ref)
  ;({ useSessionStore } = await import('../../app/stores/session'))
})

describe('session refresh', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('uses the request-aware fetcher supplied by the Nuxt request context', async () => {
    const session = useSessionStore()
    const requestFetch = vi.fn(async (path: string) => {
      if (path === '/api/setup/health') {
        return { users: 1, twitterAuth: false }
      }
      if (path === '/api/me') {
        return {
          user: {
            id: 'user-1',
            displayName: 'Owner',
            avatarR2Key: null,
            email: 'owner@example.com',
          },
        }
      }
      throw new Error(`Unexpected path: ${path}`)
    })

    await Reflect.apply(session.refresh, session, [requestFetch])

    expect(requestFetch).toHaveBeenCalledWith('/api/setup/health')
    expect(requestFetch).toHaveBeenCalledWith('/api/me')
    expect(session.user?.id).toBe('user-1')
    expect(session.ready).toBe(true)
  })
})
