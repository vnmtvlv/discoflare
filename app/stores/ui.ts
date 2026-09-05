import { defineStore } from 'pinia'
import { useLocalStorage } from '@vueuse/core'
import { ref } from 'vue'
import type { RightPanelTab } from '~~/shared/types'

type LastChannel = { workspaceId: string; channelId: string }

export function isLastChannel(value: unknown): value is LastChannel {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<LastChannel>
  return Boolean(
    candidate.workspaceId
    && candidate.workspaceId !== 'undefined'
    && candidate.workspaceId !== 'null'
    && candidate.channelId
    && candidate.channelId !== 'undefined'
    && candidate.channelId !== 'null',
  )
}

export const useUiStore = defineStore('ui', () => {
  type ComposerState = {
    draft: string
    replyToId: string | null
    editingId: string | null
  }

  const rightPanelOpen = ref(true)
  const rightPanelTab = ref<RightPanelTab>('members')
  const mobilePane = ref<'channels' | 'chat' | 'members'>('chat')
  const composerStates = ref<Record<string, ComposerState>>({})
  const huddleSetupOpen = ref(false)
  const threadId = ref<string | null>(null)
  const threadParentId = ref<string | null>(null)
  const dmFrozen = ref(false)
  const searchQuery = ref('')
  const searchOpen = ref(false)
  const memberTab = ref<'all' | 'online'>('all')
  const channelPaneWidth = import.meta.client
    ? useLocalStorage('df:channel-pane-width', 240)
    : ref(240)
  const rightPanelWidth = import.meta.client
    ? useLocalStorage('df:right-panel-width', 240)
    : ref(240)
  const navCollapsed = import.meta.client
    ? useLocalStorage<Record<string, boolean>>('df:nav-collapsed', {})
    : ref<Record<string, boolean>>({})
  const lastChannel = import.meta.client
    ? useLocalStorage<LastChannel | null>('df:last', null)
    : ref<LastChannel | null>(null)

  function isCollapsed(key: string) {
    return Boolean(navCollapsed.value[key])
  }

  function setCollapsed(key: string, value: boolean) {
    navCollapsed.value = { ...navCollapsed.value, [key]: value }
  }

  function remember(workspaceId: string, channelId: string) {
    if (!workspaceId || workspaceId === 'undefined' || !channelId || channelId === 'undefined') return
    lastChannel.value = { workspaceId, channelId }
  }

  function last(): LastChannel | null {
    if (isLastChannel(lastChannel.value)) return lastChannel.value
    lastChannel.value = null
    return null
  }

  function composerState(channelId: string): ComposerState {
    return composerStates.value[channelId] ??= {
      draft: '',
      replyToId: null,
      editingId: null,
    }
  }

  function setComposerDraft(channelId: string, draft: string) {
    composerState(channelId).draft = draft
  }

  function startReply(channelId: string, messageId: string) {
    const state = composerState(channelId)
    state.replyToId = messageId
    state.editingId = null
  }

  function startEditing(channelId: string, messageId: string, content: string) {
    const state = composerState(channelId)
    state.draft = content
    state.replyToId = null
    state.editingId = messageId
  }

  function cancelComposerIntent(channelId: string, clearDraft = false) {
    const state = composerState(channelId)
    state.replyToId = null
    state.editingId = null
    if (clearDraft) state.draft = ''
  }

  function clearComposer(channelId: string) {
    composerStates.value[channelId] = {
      draft: '',
      replyToId: null,
      editingId: null,
    }
  }

  return {
    rightPanelOpen,
    rightPanelTab,
    mobilePane,
    huddleSetupOpen,
    threadId,
    threadParentId,
    dmFrozen,
    searchQuery,
    searchOpen,
    memberTab,
    channelPaneWidth,
    rightPanelWidth,
    navCollapsed,
    isCollapsed,
    setCollapsed,
    remember,
    last,
    composerState,
    setComposerDraft,
    startReply,
    startEditing,
    cancelComposerIntent,
    clearComposer,
  }
})
