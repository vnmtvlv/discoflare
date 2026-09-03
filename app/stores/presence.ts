import { defineStore } from 'pinia'
import type { PresenceStatus } from '~~/shared/types'

export const usePresenceStore = defineStore('presence', () => {
  const byUser = ref<Record<string, PresenceStatus>>({})
  const typing = ref<Record<string, number>>({})

  function apply(users: Array<{ userId: string; status: PresenceStatus }>) {
    const next: Record<string, PresenceStatus> = { ...byUser.value }
    for (const u of users) next[u.userId] = u.status
    byUser.value = next
  }

  function markTyping(userId: string) {
    typing.value = { ...typing.value, [userId]: Date.now() + 3000 }
  }

  function statusOf(userId: string): PresenceStatus {
    return byUser.value[userId] ?? 'offline'
  }

  return { byUser, typing, apply, markTyping, statusOf }
})
