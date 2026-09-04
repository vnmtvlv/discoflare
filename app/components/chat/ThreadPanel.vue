<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import type { ChannelDTO, ClientMsg, MemberDTO, MessageDTO } from '~~/shared/types'
import { hasPermission, Permission } from '~~/shared/permissions'

const props = defineProps<{
  workspaceId: string
  members: MemberDTO[]
  canPin?: boolean
}>()
const ui = useUiStore()
const threadId = computed(() => ui.threadId)
const { api } = useApi()
const { send } = useChannelSocket(computed(() => threadId.value || ''))
const threadQ = useQuery({
  queryKey: computed(() => ['channel', threadId.value]),
  queryFn: () => api<{ channel: ChannelDTO }>(`/api/channels/${threadId.value}`),
  enabled: computed(() => Boolean(threadId.value)),
})
const threadName = computed(() => threadQ.data.value?.channel.name || 'Thread')
const threadTitle = computed(() => threadQ.data.value?.channel.title || threadName.value)
const { mine } = usePermissions(computed(() => props.members))
const effectivePermissions = computed(() => threadQ.data.value?.channel.permissions ?? mine.value?.role.permissions ?? 0)
const canSendMessages = computed(() => hasPermission(effectivePermissions.value, Permission.sendMessages))
const canAttachFiles = computed(() => hasPermission(effectivePermissions.value, Permission.attachFiles))

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
    id="channel-details"
    class="absolute inset-x-0 bottom-[calc(-1*var(--df-safe-area-bottom))] top-[calc(-1*var(--df-safe-area-top))] z-30 flex min-h-0 w-full shrink-0 flex-col border-l border-default bg-elevated pb-[var(--df-safe-area-bottom)] pt-[var(--df-safe-area-top)] md:relative md:inset-auto md:z-auto md:w-[var(--df-right-panel-width)] md:p-0"
    :style="{ '--df-right-panel-width': `${ui.rightPanelWidth}px` }"
    aria-label="Thread"
  >
    <LayoutResizeHandle
      v-model="ui.rightPanelWidth"
      class="hidden md:block"
      :min="180"
      :max="640"
      side="start"
      label="Resize thread panel"
    />
    <header class="flex h-12 shrink-0 min-w-0 items-center gap-2 border-b border-default bg-elevated px-3">
      <span class="truncate text-sm font-semibold">{{ threadTitle }}</span>
      <UBadge label="Thread" color="neutral" variant="subtle" size="sm" class="shrink-0" />
      <UTooltip text="Back to threads">
        <UButton class="ml-auto size-11 shrink-0 md:size-8" size="sm" color="neutral" variant="ghost" icon="i-ph-arrow-left" aria-label="Back to threads" @click="close" />
      </UTooltip>
    </header>
    <ChatMessageList
      :channel-id="threadId"
      :members="members"
      :channel-name="threadTitle"
      :show-intro="false"
      :can-pin="props.canPin"
      @reply="onReply"
      @edit="onEdit"
      @read="(messageId) => send({ t: 'read', messageId })"
    />
    <ChatComposer
      :channel-id="threadId"
      :workspace-id="props.workspaceId"
      :members="props.members"
      :send="send as (msg: ClientMsg) => void"
      :disabled="!canSendMessages"
      :can-attach="canAttachFiles"
      placeholder="Reply in thread"
    />
  </aside>
</template>
