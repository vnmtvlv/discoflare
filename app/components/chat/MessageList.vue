<script setup lang="ts">
import { useInfiniteQuery } from '@tanstack/vue-query'
import type { MemberDTO, MessageDTO } from '~~/shared/types'
import { formatDayLabel, sameDay } from '~~/shared/format'

const props = defineProps<{
  channelId: string
  members: MemberDTO[]
  channelName?: string
  isDm?: boolean
  showIntro?: boolean
}>()
const emit = defineEmits<{
  reply: [id: string]
  edit: [msg: MessageDTO]
  thread: [msg: MessageDTO]
  read: [messageId: string]
}>()

const session = useSessionStore()
const ui = useUiStore()
const prefs = usePrefsStore()
const scroller = ref<HTMLElement | null>(null)
let lastRead = ''

const q = useInfiniteQuery({
  queryKey: computed(() => ['messages', props.channelId]),
  initialPageParam: undefined as string | undefined,
  queryFn: ({ pageParam }) => $fetch<{ messages: MessageDTO[]; nextCursor: string | null }>(
    `/api/channels/${props.channelId}/messages`,
    { query: { cursor: pageParam, limit: 50 } },
  ),
  getNextPageParam: (last) => last.nextCursor ?? undefined,
})

const messages = computed(() => {
  const pages = q.data.value?.pages ?? []
  return [...pages].reverse().flatMap((p) => p.messages)
})

const searchResults = computed(() => {
  const needle = ui.searchQuery.trim().toLowerCase()
  if (!needle) return []
  return messages.value.filter((m) =>
    m.content.toLowerCase().includes(needle)
    || m.author.displayName.toLowerCase().includes(needle),
  ).slice(0, 20)
})

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
  await $fetch(`/api/messages/${id}`, { method: 'DELETE' })
}

async function react(id: string, emoji: string) {
  await $fetch(`/api/messages/${id}/reactions`, { method: 'POST', body: { emoji } })
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

async function goToResult(id: string) {
  ui.searchOpen = false
  await nextTick()
  document.getElementById(`message-${id}`)?.scrollIntoView({ block: 'center' })
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
        <div :id="`message-${m.id}`">
          <ChatMessageItem
            :message="m"
            :names="names"
            :mine="m.author.id === session.user?.id"
            :compact="compactWith(m, messages[i - 1])"
            @reply="emit('reply', m.id)"
            @edit="emit('edit', m)"
            @remove="remove(m.id)"
            @thread="emit('thread', m)"
            @jump="jumpToMessage"
            @react="(emoji) => react(m.id, emoji)"
          />
        </div>
      </template>
    </template>
    <UModal v-model:open="ui.searchOpen" :ui="{ content: 'sm:max-w-2xl' }">
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
            <button
              v-for="message in searchResults"
              :key="message.id"
              type="button"
              class="w-full rounded-md px-3 py-2 text-start hover:bg-elevated"
              @click="goToResult(message.id)"
            >
              <span class="block text-xs font-semibold text-highlighted">{{ message.author.displayName }}</span>
              <span class="block truncate text-sm text-muted">{{ message.content }}</span>
            </button>
            <p v-if="!searchResults.length" class="px-3 py-8 text-center text-sm text-muted">No matches</p>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
