import { defineStore } from 'pinia'
import type { SessionUser, SetupHealth } from '~~/shared/types'

type SessionFetcher = (request: string, options?: {
  method?: 'POST'
  body?: { email: string, password: string }
}) => Promise<unknown>

export function asSessionFetcher(fetcher: unknown): SessionFetcher {
  return fetcher as SessionFetcher
}

export const useSessionStore = defineStore('session', () => {
  const user = ref<SessionUser | null>(null)
  const health = ref<SetupHealth | null>(null)
  const ready = ref(false)

  async function refresh(fetcher: SessionFetcher = asSessionFetcher($fetch)) {
    try {
      health.value = await fetcher('/api/setup/health') as SetupHealth
    }
    catch {
      health.value = null
    }
    try {
      const res = await fetcher('/api/me') as { user: SessionUser }
      user.value = res.user
    }
    catch {
      user.value = null
    }
    ready.value = true
  }

  async function login(email: string, password: string, fetcher: SessionFetcher = asSessionFetcher($fetch)) {
    const res = await fetcher('/api/auth/login', { method: 'POST', body: { email, password } }) as { user: SessionUser }
    user.value = res.user
  }

  async function logout(fetcher: SessionFetcher = asSessionFetcher($fetch)) {
    await fetcher('/api/auth/logout', { method: 'POST' })
    user.value = null
  }

  return { user, health, ready, refresh, login, logout }
})
