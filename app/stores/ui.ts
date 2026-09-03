import { defineStore } from 'pinia'
import { useLocalStorage } from '@vueuse/core'

export const useUiStore = defineStore('ui', () => {
  const memberRailOpen = ref(true)
  const mobilePane = ref<'channels' | 'chat' | 'members'>('chat')
  const composerDraft = ref('')
  const replyToId = ref<string | null>(null)
  const editingId = ref<string | null>(null)
  const huddleSetupOpen = ref(false)
  const threadId = ref<string | null>(null)
  const threadParentId = ref<string | null>(null)
  const dmFrozen = ref(false)
  const searchQuery = ref('')
  const memberTab = ref<'all' | 'online'>('all')
  const lastChannel = import.meta.client
    ? useLocalStorage<{ guildId: string; channelId: string } | null>('df:last', null)
    : ref<{ guildId: string; channelId: string } | null>(null)

  function remember(guildId: string, channelId: string) {
    if (!guildId || guildId === 'undefined' || !channelId || channelId === 'undefined') return
    lastChannel.value = { guildId, channelId }
  }

  function last(): { guildId: string; channelId: string } | null {
    return lastChannel.value
  }

  return { memberRailOpen, mobilePane, composerDraft, replyToId, editingId, huddleSetupOpen, threadId, threadParentId, dmFrozen, searchQuery, memberTab, remember, last }
})
