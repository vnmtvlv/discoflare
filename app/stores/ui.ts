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
    ? useLocalStorage<{ workspaceId: string; channelId: string } | null>('df:last', null)
    : ref<{ workspaceId: string; channelId: string } | null>(null)

  function remember(workspaceId: string, channelId: string) {
    if (!workspaceId || workspaceId === 'undefined' || !channelId || channelId === 'undefined') return
    lastChannel.value = { workspaceId, channelId }
  }

  function last(): { workspaceId: string; channelId: string } | null {
    return lastChannel.value
  }

  return { memberRailOpen, mobilePane, composerDraft, replyToId, editingId, huddleSetupOpen, threadId, threadParentId, dmFrozen, searchQuery, memberTab, remember, last }
})
