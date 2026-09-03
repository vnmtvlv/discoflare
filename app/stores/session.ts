import { defineStore } from 'pinia'
import type { SessionUser, SetupHealth } from '~~/shared/types'

export const useSessionStore = defineStore('session', () => {
  const user = ref<SessionUser | null>(null)
  const health = ref<SetupHealth | null>(null)
  const ready = ref(false)

  async function refresh() {
    try {
      health.value = await $fetch<SetupHealth>('/api/setup/health')
    }
    catch {
      health.value = null
    }
    try {
      const res = await $fetch<{ user: SessionUser }>('/api/me')
      user.value = res.user
    }
    catch {
      user.value = null
    }
    ready.value = true
  }

  async function login(email: string, password: string) {
    const res = await $fetch<{ user: SessionUser }>('/api/auth/login', { method: 'POST', body: { email, password } })
    user.value = res.user
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
  }

  return { user, health, ready, refresh, login, logout }
})
