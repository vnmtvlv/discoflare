<script setup lang="ts">
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { InfiniteData } from '@tanstack/vue-query'
import type { ChannelThreadDTO, MemberDTO, MessageContextResponse, MessageDTO, MessagePinDTO, MessageSearchHitDTO, MessageSearchResponse } from '~~/shared/types'
import { formatDayLabel, formatMessageTime, sameDay } from '~~/shared/format'
import { mergeMessageContext, type MessagePage } from '~/utils/message-cache'

const props = defineProps<{
  channelId: string
  members: MemberDTO[]
  channelName?: string
  isDm?: boolean
  canPin?: boolean
  showIntro?: boolean
}>()
const { api } = useApi()
const emit = defineEmits<{
  reply: [id: string]
  edit: [msg: MessageDTO]
  thread: [msg: MessageDTO]
  read: [messageId: string]
}>()

const session = useSessionStore()
const ui = useUiStore()
const prefs = usePrefsStore()
const toast = useToast()
const qc = useQueryClient()
const scroller = ref<HTMLElement | null>(null)
const searchTargetId = ref<string | null>(null)
const jumpingToId = ref<string | null>(null)
let lastRead = ''

const q = useInfiniteQuery({
  queryKey: computed(() => ['messages', props.channelId]),
  initialPageParam: undefined as string | undefined,
  queryFn: ({ pageParam }) => api<{ messages: MessageDTO[]; nextCursor: string | null }>(
    `/api/channels/${props.channelId}/messages`,
    { query: { cursor: pageParam, limit: 50 } },
  ),
  getNextPageParam: (last) => last.nextCursor ?? undefined,
})

const messages = computed(() => {
  const pages = q.data.value?.pages ?? []
  return [...pages].reverse().flatMap((p) => p.messages)
})
const threadsQ = useQuery({
  queryKey: computed(() => ['threads', props.channelId]),
  queryFn: () => api<{ threads: ChannelThreadDTO[] }>(`/api/channels/${props.channelId}/threads`),
  enabled: computed(() => messages.value.some(message => Boolean(message.threadId))),
})
const threadsByMessage = computed(() => new Map(
  (threadsQ.data.value?.threads ?? []).map(thread => [thread.parentMessageId, thread]),
))

const ownsSearch = computed(() => !ui.threadId || ui.threadId === props.channelId)
const requestedSearchTerm = computed(() => ui.searchQuery.trim())
const searchTerm = refDebounced(computed(() => ui.searchQuery.trim()), 250)
const searchSettled = computed(() => searchTerm.value === requestedSearchTerm.value)
const hasSearchableTerm = computed(() => /[\p{L}\p{N}]/u.test(requestedSearchTerm.value))
const searchReady = computed(() => ownsSearch.value
  && ui.searchOpen
  && searchSettled.value
  && hasSearchableTerm.value)

const searchQ = useInfiniteQuery({
  queryKey: computed(() => ['message-search', props.channelId, searchTerm.value]),
  initialPageParam: undefined as string | undefined,
  queryFn: ({ pageParam }) => api<MessageSearchResponse>(`/api/channels/${props.channelId}/search`, {
    query: { q: searchTerm.value, cursor: pageParam, limit: 20 },
  }),
  getNextPageParam: last => last.nextCursor ?? undefined,
  enabled: searchReady,
})

const searchResults = computed(() => searchReady.value
  ? searchQ.data.value?.pages.flatMap(page => page.hits) ?? []
  : [])
const searchLoading = computed(() => Boolean(
  requestedSearchTerm.value
  && hasSearchableTerm.value
  && (!searchSettled.value || (searchReady.value && searchQ.isPending.value)),
))
const searchEmpty = computed(() => Boolean(
  requestedSearchTerm.value
  && searchSettled.value
  && (!hasSearchableTerm.value || (searchReady.value && !searchQ.isPending.value && !searchQ.error.value && !searchResults.value.length)),
))

const names = computed(() => {
  const map: Record<string, string> = {}
  for (const m of props.members) map[m.user.id] = m.nickname || m.user.displayName
  return map
})

function compactWith(curr: MessageDTO, prev?: MessageDTO) {
  if (!prev) return false
  if (prev.author.id !== curr.author.id) return false
  if (prev.deletedAt) return false
  if (!sameDay(curr.createdAt, prev.createdAt)) return false
  const dt = Math.abs(new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime())
  return dt < 7 * 60 * 1000
}

function markReadIfVisible() {
  const el = scroller.value
  const message = messages.value.at(-1)
  if (!el || !message || ui.searchOpen || document.hidden || !document.hasFocus()) return
  if (el.scrollHeight - el.scrollTop - el.clientHeight > 120 || message.id === lastRead || message.id.startsWith('tmp:')) return
  lastRead = message.id
  emit('read', message.id)
}

watch(() => messages.value.at(-1)?.id, async () => {
  await nextTick()
  const el = scroller.value
  if (!el) return
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
    el.scrollTop = el.scrollHeight
  }
  markReadIfVisible()
})

function onScroll() {
  const el = scroller.value
  if (!el || q.isFetchingNextPage.value) return
  if (el.scrollTop < 80 && q.hasNextPage.value) {
    const prev = el.scrollHeight
    void q.fetchNextPage().then(async () => {
      await nextTick()
      if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight - prev
    })
  }
  markReadIfVisible()
}

async function remove(id: string) {
  await api(`/api/messages/${id}`, { method: 'DELETE' })
}

async function react(id: string, emoji: string) {
  await api(`/api/messages/${id}/reactions`, { method: 'POST', body: { emoji } })
}

async function togglePin(message: MessageDTO) {
  if (!props.canPin) return
  try {
    const response = await api<{ pin: MessagePinDTO | null }>(`/api/messages/${message.id}/pin`, {
      method: message.pin ? 'DELETE' : 'PUT',
    })
    qc.setQueryData<InfiniteData<MessagePage>>(['messages', props.channelId], (current) => {
      if (!current) return current
      return {
        ...current,
        pages: current.pages.map(page => ({
          ...page,
          messages: page.messages.map(item => item.id === message.id ? { ...item, pin: response.pin } : item),
        })),
      }
    })
    await qc.invalidateQueries({ queryKey: ['pins', props.channelId] })
  }
  catch {
    toast.add({ title: message.pin ? 'Could not unpin message' : 'Could not pin message', color: 'error' })
  }
}

onMounted(() => {
  nextTick(() => {
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
    markReadIfVisible()
  })
  window.addEventListener('focus', markReadIfVisible)
  document.addEventListener('visibilitychange', markReadIfVisible)
})

onUnmounted(() => {
  window.removeEventListener('focus', markReadIfVisible)
  document.removeEventListener('visibilitychange', markReadIfVisible)
})

watch(() => ui.searchOpen, (open) => {
  if (!open) ui.searchQuery = ''
})

async function goToResult(hit: MessageSearchHitDTO) {
  jumpingToId.value = hit.id
  try {
    const context = await api<MessageContextResponse>(
      `/api/channels/${hit.channel.id}/messages/${hit.id}/context`,
    )
    await qc.cancelQueries({ queryKey: ['messages', hit.channel.id], exact: true })
    qc.setQueryData<InfiniteData<MessagePage>>(
      ['messages', hit.channel.id],
      current => mergeMessageContext(current, context),
    )
    searchTargetId.value = hit.id
    ui.searchOpen = false
    await nextTick()
    requestAnimationFrame(() => {
      document.getElementById(`message-${hit.id}`)?.scrollIntoView({ block: 'center' })
    })
    setTimeout(() => {
      if (searchTargetId.value === hit.id) searchTargetId.value = null
    }, 1800)
  }
  catch {
    toast.add({ title: 'Could not open message', color: 'error' })
  }
  finally {
    jumpingToId.value = null
  }
}

function jumpToMessage(id: string) {
  document.getElementById(`message-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}
</script>

<template>
  <div ref="scroller" class="flex-1 overflow-y-auto flex flex-col" :class="prefs.compact ? 'text-[13px]' : ''" role="log" aria-live="polite" aria-relevant="additions" @scroll="onScroll">
    <div class="flex-1 min-h-4" />
    <div v-if="q.isPending.value" class="p-6">
      <USkeleton class="h-24" />
    </div>
    <UAlert v-else-if="q.error.value" color="error" title="Could not load messages." class="m-3" />
    <div v-else-if="showIntro !== false" class="px-4 pt-4 pb-2">
      <div class="size-16 rounded-full bg-accented flex items-center justify-center mb-2">
        <UIcon :name="isDm ? 'i-ph-at' : 'i-ph-hash'" class="size-9 text-highlighted" />
      </div>
      <h2 class="text-[32px] leading-tight font-bold text-highlighted tracking-tight">
        Welcome to {{ isDm ? '' : '#' }}{{ channelName || 'channel' }}{{ isDm ? '' : '!' }}
      </h2>
      <p class="mt-1 text-muted text-[15px]">
        {{ isDm ? `This is the beginning of your direct message history.` : `This is the start of the #${channelName || 'channel'} channel.` }}
      </p>
    </div>
    <template v-if="messages.length">
      <UButton
        v-if="q.hasNextPage.value"
        variant="ghost"
        color="neutral"
        size="xs"
        class="mx-auto my-3"
        :loading="q.isFetchingNextPage.value"
        :label="q.isFetchingNextPage.value ? 'Loading…' : 'Load older'"
        @click="q.fetchNextPage()"
      />
      <template v-for="(m, i) in messages" :key="m.id">
        <div v-if="i === 0 || !sameDay(m.createdAt, messages[i - 1]!.createdAt)" class="flex items-center gap-1 px-4 my-2">
          <div class="flex-1 border-t border-default" />
          <span class="text-xs font-semibold text-muted px-1">{{ formatDayLabel(m.createdAt) }}</span>
          <div class="flex-1 border-t border-default" />
        </div>
        <div
          :id="`message-${m.id}`"
          class="transition-colors duration-500"
          :class="searchTargetId === m.id ? 'bg-primary/10' : ''"
        >
          <ChatMessageItem
            :message="m"
            :thread="threadsByMessage.get(m.id)"
            :names="names"
            :mine="m.author.id === session.user?.id"
            :can-pin="canPin"
            :compact="compactWith(m, messages[i - 1])"
            @reply="emit('reply', m.id)"
            @edit="emit('edit', m)"
            @remove="remove(m.id)"
            @thread="emit('thread', m)"
            @jump="jumpToMessage"
            @react="(emoji) => react(m.id, emoji)"
            @pin="togglePin(m)"
          />
        </div>
      </template>
    </template>
    <UModal v-if="ownsSearch" v-model:open="ui.searchOpen" :ui="{ content: 'sm:max-w-2xl' }">
      <template #content>
        <div class="p-3">
          <UInput
            v-model="ui.searchQuery"
            icon="i-ph-magnifying-glass"
            size="xl"
            placeholder="Search messages"
            autofocus
            class="w-full"
          />
          <div v-if="ui.searchQuery.trim()" class="mt-2 max-h-96 overflow-y-auto">
            <div v-if="searchLoading" class="p-3">
              <USkeleton class="h-16" />
            </div>
            <UAlert v-else-if="searchReady && searchQ.error.value" color="error" variant="subtle" title="Could not search messages." />
            <template v-else>
              <button
                v-for="message in searchResults"
                :key="message.id"
                type="button"
                class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-start hover:bg-elevated"
                :disabled="Boolean(jumpingToId)"
                @click="goToResult(message)"
              >
                <UAvatar size="xs" :text="message.author.displayName.slice(0, 1).toUpperCase()" :alt="message.author.displayName" />
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-2 text-xs">
                    <strong class="truncate text-highlighted">{{ message.author.displayName }}</strong>
                    <time class="shrink-0 text-muted">{{ formatMessageTime(message.createdAt) }}</time>
                  </span>
                  <span class="block truncate text-sm text-muted">{{ message.content }}</span>
                </span>
                <UIcon v-if="jumpingToId === message.id" name="i-ph-spinner" class="size-4 shrink-0 animate-spin text-muted" />
              </button>
            </template>
            <p v-if="searchEmpty" class="px-3 py-8 text-center text-sm text-muted">No matches</p>
            <UButton
              v-if="searchReady && searchQ.hasNextPage.value"
              class="mx-auto mt-2 flex"
              color="neutral"
              variant="ghost"
              size="xs"
              :loading="searchQ.isFetchingNextPage.value"
              label="Load more"
              @click="searchQ.fetchNextPage()"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
