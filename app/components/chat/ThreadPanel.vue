<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import type { ChannelDTO, ClientMsg, MemberDTO, MessageDTO } from '~~/shared/types'

const props = defineProps<{
  workspaceId: string
  members: MemberDTO[]
}>()
const ui = useUiStore()
const threadId = computed(() => ui.threadId)
const { send } = useChannelSocket(computed(() => threadId.value || ''))
const threadQ = useQuery({
  queryKey: computed(() => ['channel', threadId.value]),
  queryFn: () => $fetch<{ channel: ChannelDTO }>(`/api/channels/${threadId.value}`),
  enabled: computed(() => Boolean(threadId.value)),
})
const threadName = computed(() => threadQ.data.value?.channel.name || 'Thread')
const threadTitle = computed(() => threadQ.data.value?.channel.title || threadName.value)

function close() {
  ui.threadId = null
  ui.threadParentId = null
}

function onReply(id: string) {
  if (threadId.value) ui.startReply(threadId.value, id)
}
function onEdit(msg: MessageDTO) {
  if (threadId.value) ui.startEditing(threadId.value, msg.id, msg.content)
}

defineShortcuts({
  escape: () => {
    if (threadId.value) close()
  },
})
</script>

<template>
  <aside
    v-if="threadId"
    class="shrink-0 relative border-l border-default bg-elevated flex-col min-h-0 hidden md:flex"
    :style="{ width: `${ui.rightPanelWidth}px` }"
    aria-label="Right panel"
  >
    <LayoutResizeHandle
      v-model="ui.rightPanelWidth"
      :min="180"
      :max="640"
      side="start"
      label="Resize thread panel"
    />
    <header class="shrink-0 border-b border-default bg-elevated">
      <div class="flex h-12 items-center gap-2 px-3">
        <LayoutRightPanelTabs v-model="ui.rightPanelTab" />
      </div>
      <div class="flex min-w-0 items-center gap-2 px-3 pb-2">
        <span class="truncate text-sm font-semibold">{{ threadTitle }}</span>
        <UBadge label="Thread" color="neutral" variant="subtle" size="sm" class="shrink-0" />
        <UTooltip text="Back to threads">
          <UButton class="ml-auto shrink-0" size="xs" color="neutral" variant="ghost" icon="i-ph-arrow-left" aria-label="Back to threads" @click="close" />
        </UTooltip>
      </div>
    </header>
    <ChatMessageList
      :channel-id="threadId"
      :members="members"
      :channel-name="threadTitle"
      :show-intro="false"
      @reply="onReply"
      @edit="onEdit"
      @read="(messageId) => send({ t: 'read', messageId })"
    />
    <ChatComposer
      :channel-id="threadId"
      :workspace-id="props.workspaceId"
      :members="props.members"
      :send="send as (msg: ClientMsg) => void"
      placeholder="Reply in thread"
    />
  </aside>
</template>
