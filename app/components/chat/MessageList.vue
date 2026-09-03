<script setup lang="ts">
import { useInfiniteQuery } from '@tanstack/vue-query'
import type { MemberDTO, MessageDTO } from '~~/shared/types'
import { formatDayLabel, sameDay } from '~~/shared/format'

const props = defineProps<{
  channelId: string
  members: MemberDTO[]
  channelName?: string
  isDm?: boolean
}>()
const emit = defineEmits<{
  reply: [id: string]
  edit: [msg: MessageDTO]
  thread: [msg: MessageDTO]
}>()

const session = useSessionStore()
const ui = useUiStore()
const prefs = usePrefsStore()
const scroller = ref<HTMLElement | null>(null)

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
  const all = [...pages].reverse().flatMap((p) => p.messages)
  const needle = ui.searchQuery.trim().toLowerCase()
  if (!needle) return all
  return all.filter((m) =>
    m.content.toLowerCase().includes(needle)
    || m.author.displayName.toLowerCase().includes(needle),
  )
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

watch(() => messages.value.length, async () => {
  await nextTick()
  const el = scroller.value
  if (!el) return
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
    el.scrollTop = el.scrollHeight
  }
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
  })
})
</script>

<template>
  <div ref="scroller" class="flex-1 overflow-y-auto flex flex-col" :class="prefs.compact ? 'text-[13px]' : ''" role="log" aria-live="polite" aria-relevant="additions" @scroll="onScroll">
    <div class="flex-1 min-h-4" />
    <div v-if="q.isPending.value" class="p-6">
      <USkeleton class="h-24" />
    </div>
    <UAlert v-else-if="q.error.value" color="error" title="Could not load messages." class="m-3" />
    <div v-else class="px-4 pt-4 pb-2">
      <div class="size-16 rounded-full bg-accented flex items-center justify-center mb-2">
        <UIcon :name="isDm ? 'i-ph-at' : 'i-ph-hash'" class="size-9 text-highlighted" />
      </div>
      <h2 class="text-[32px] leading-tight font-bold text-highlighted tracking-tight">
        Welcome to {{ isDm ? '' : '#' }}{{ channelName || 'channel' }}{{ isDm ? '' : '!' }}
      </h2>
      <p class="mt-1 text-muted text-[15px]">
        {{ isDm ? `This is the beginning of your direct message history.` : `This is the start of the #${channelName} channel.` }}
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
        <ChatMessageItem
          :message="m"
          :names="names"
          :mine="m.author.id === session.user?.id"
          :compact="compactWith(m, messages[i - 1])"
          @reply="emit('reply', m.id)"
          @edit="emit('edit', m)"
          @remove="remove(m.id)"
          @thread="emit('thread', m)"
          @react="(emoji) => react(m.id, emoji)"
        />
      </template>
    </template>
  </div>
</template>
