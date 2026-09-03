<script setup lang="ts">
import type { ClientMsg, MemberDTO, MessageDTO } from '~~/shared/types'

defineProps<{
  guildId: string
  members: MemberDTO[]
}>()
const ui = useUiStore()
const threadId = computed(() => ui.threadId)
const { send } = useChannelSocket(computed(() => threadId.value || ''))

function close() {
  ui.threadId = null
  ui.threadParentId = null
}

function onReply(id: string) {
  ui.replyToId = id
}
function onEdit(msg: MessageDTO) {
  ui.editingId = msg.id
  ui.composerDraft = msg.content
}

defineShortcuts({
  escape: () => {
    if (threadId.value) close()
  },
})
</script>

<template>
  <aside v-if="threadId" class="w-80 border-l border-default bg-elevated flex flex-col min-h-0 hidden md:flex" aria-label="Thread">
    <header class="h-12 px-3 flex items-center border-b border-default">
      <span class="font-semibold text-sm">Thread</span>
      <UButton class="ml-auto" size="xs" color="neutral" variant="ghost" icon="i-ph-x" @click="close" />
    </header>
    <ChatMessageList :channel-id="threadId" :members="members" @reply="onReply" @edit="onEdit" />
    <ChatComposer
      :channel-id="threadId"
      :guild-id="guildId"
      :members="members"
      :send="send as (msg: ClientMsg) => void"
      placeholder="Reply in thread"
    />
  </aside>
</template>
