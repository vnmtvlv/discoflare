<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import type { ChannelThreadDTO } from '~~/shared/types'
import { formatMessageTime } from '~~/shared/format'

const props = defineProps<{
  channelId: string
}>()
const ui = useUiStore()

const threadsQ = useQuery({
  queryKey: computed(() => ['threads', props.channelId]),
  queryFn: () => $fetch<{ threads: ChannelThreadDTO[] }>(`/api/channels/${props.channelId}/threads`),
  enabled: computed(() => Boolean(props.channelId)),
})

function openThread(thread: ChannelThreadDTO) {
  ui.threadId = thread.id
  ui.threadParentId = props.channelId
  ui.rightPanelOpen = true
  ui.rightPanelTab = 'threads'
}
</script>

<template>
  <div v-if="threadsQ.isPending.value" class="p-3">
    <USkeleton class="h-24" />
  </div>
  <UAlert v-else-if="threadsQ.error.value" color="error" title="Could not load threads." class="m-3" />
  <p v-else-if="!threadsQ.data.value?.threads.length" class="p-3 text-sm text-muted">No threads yet.</p>
  <div v-else class="p-2">
    <button
      v-for="thread in threadsQ.data.value?.threads"
      :key="thread.id"
      type="button"
      class="flex w-full items-start gap-2 rounded-md px-2 py-2 text-start hover:bg-elevated"
      @click="openThread(thread)"
    >
      <UAvatar size="xs" :text="thread.author.displayName.slice(0, 1).toUpperCase()" :alt="thread.author.displayName" />
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-medium text-highlighted">{{ thread.title }}</span>
        <span class="mt-0.5 flex items-center gap-1 text-xs text-muted">
          <span>{{ thread.author.displayName }}</span>
          <span>·</span>
          <span>{{ thread.replyCount }} {{ thread.replyCount === 1 ? 'reply' : 'replies' }}</span>
          <span v-if="thread.lastReplyAt">· {{ formatMessageTime(thread.lastReplyAt) }}</span>
        </span>
      </span>
    </button>
  </div>
</template>
