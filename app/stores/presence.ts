import { defineStore } from 'pinia'
import type { PresenceStatus } from '~~/shared/types'

export const usePresenceStore = defineStore('presence', () => {
  const byUser = ref<Record<string, PresenceStatus>>({})
  const typing = ref<Record<string, Record<string, boolean>>>({})
  const typingTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function apply(users: Array<{ userId: string; status: PresenceStatus }>) {
    const next: Record<string, PresenceStatus> = {}
    for (const u of users) next[u.userId] = u.status
    byUser.value = next
  }

  function markTyping(channelId: string, userId: string) {
    const key = `${channelId}:${userId}`
    const channel = { ...(typing.value[channelId] ?? {}), [userId]: true }
    typing.value = { ...typing.value, [channelId]: channel }
    const previous = typingTimers.get(key)
    if (previous) clearTimeout(previous)
    typingTimers.set(key, setTimeout(() => {
      const nextChannel = Object.fromEntries(
        Object.entries(typing.value[channelId] ?? {}).filter(([id]) => id !== userId),
      )
      typing.value = { ...typing.value, [channelId]: nextChannel }
      typingTimers.delete(key)
    }, 3000))
  }

  function typingIn(channelId: string): string[] {
    return Object.keys(typing.value[channelId] ?? {})
  }

  function statusOf(userId: string): PresenceStatus {
    return byUser.value[userId] ?? 'offline'
  }

  return { byUser, typing, apply, markTyping, typingIn, statusOf }
})
