<script setup lang="ts">
import type { ClientMsg, MemberDTO, MessageDTO } from '~~/shared/types'
import { applyMentionTokens } from '~~/shared/mentions'
import { newId, nowIso } from '~~/shared/ids'
import { useQueryClient, type InfiniteData } from '@tanstack/vue-query'
import { useDebounceFn, useFileDialog } from '@vueuse/core'

const props = defineProps<{
  channelId: string
  guildId: string
  members: MemberDTO[]
  send: (msg: ClientMsg) => void
  placeholder?: string
  disabled?: boolean
}>()

const emit = defineEmits<{ last: [] }>()

const ui = useUiStore()
const session = useSessionStore()
const qc = useQueryClient()
const toast = useToast()
const files = ref<File[]>([])
const emojiOpen = ref(false)
const EMOJI = ['😀', '😂', '❤️', '👍', '🔥', '🎉', '👀', '💯']

const { open: openFiles, reset: resetFiles, onChange } = useFileDialog({
  multiple: true,
  accept: '.png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.zip',
})
onChange((list) => {
  files.value = list ? Array.from(list) : []
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void submit()
  }
  if (e.key === 'Escape') {
    ui.replyToId = null
    ui.editingId = null
  }
  if (e.key === 'ArrowUp' && !ui.composerDraft && !e.shiftKey) emit('last')
}

function insertEmoji(e: string) {
  ui.composerDraft = `${ui.composerDraft || ''}${e}`
  emojiOpen.value = false
}

function removeFile(i: number) {
  files.value = files.value.filter((_, idx) => idx !== i)
}

async function submit() {
  if (props.disabled) return
  let content = applyMentionTokens(ui.composerDraft, props.members.map((m) => ({
    id: m.user.id,
    displayName: m.user.displayName,
    nickname: m.nickname,
  })))
  content = content.trim()
  const attachmentIds: string[] = []
  try {
    for (const file of files.value) {
      const fd = new FormData()
      fd.append('file', file)
      const res = await $fetch<{ attachment: { id: string } }>(`/api/channels/${props.channelId}/attachments`, {
        method: 'POST',
        body: fd,
      })
      attachmentIds.push(res.attachment.id)
    }
  }
  catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
    return
  }

  if (ui.editingId) {
    await $fetch(`/api/messages/${ui.editingId}`, { method: 'PATCH', body: { content } })
    ui.editingId = null
    ui.composerDraft = ''
    return
  }

  if (!content && !attachmentIds.length) return
  const clientId = newId()
  const optimistic: MessageDTO = {
    id: `tmp:${clientId}`,
    channelId: props.channelId,
    guildId: props.guildId,
    author: session.user!,
    content,
    replyTo: null,
    mentions: [],
    attachments: [],
    reactions: [],
    threadId: null,
    editedAt: null,
    deletedAt: null,
    createdAt: nowIso(),
    clientId,
  }
  qc.setQueryData<InfiniteData<{ messages: MessageDTO[]; nextCursor: string | null }>>(['messages', props.channelId], (old) => {
    if (!old?.pages?.length) return { pages: [{ messages: [optimistic], nextCursor: null }], pageParams: [undefined] }
    const pages = old.pages.map((p, i) => i === 0 ? { ...p, messages: [...p.messages, optimistic] } : p)
    return { ...old, pages }
  })
  props.send({ t: 'message.create', content, replyToId: ui.replyToId ?? undefined, clientId, attachmentIds: attachmentIds.length ? attachmentIds : undefined })
  ui.composerDraft = ''
  ui.replyToId = null
  files.value = []
  resetFiles()
}

const pingTyping = useDebounceFn(() => {
  if (!props.disabled && ui.composerDraft) props.send({ t: 'typing' })
}, 400)

watch(() => ui.composerDraft, () => { pingTyping() })
</script>

<template>
  <form class="px-4 pb-6 pt-2" @submit.prevent="submit">
    <div
      class="df-composer overflow-hidden"
      :class="ui.replyToId || ui.editingId ? 'rounded-b-lg' : 'rounded-lg'"
    >
      <div v-if="ui.replyToId" class="flex items-center gap-2 px-3 py-2 bg-muted text-xs text-muted">
        <span class="flex-1">Replying to message</span>
        <UButton size="xs" color="neutral" variant="ghost" square icon="i-ph-x" aria-label="Cancel reply" @click="ui.replyToId = null" />
      </div>
      <div v-else-if="ui.editingId" class="flex items-center gap-2 px-3 py-2 bg-muted text-xs text-primary">
        <span class="flex-1">Editing message</span>
        <UButton size="xs" color="neutral" variant="ghost" square icon="i-ph-x" aria-label="Cancel edit" @click="ui.editingId = null; ui.composerDraft = ''" />
      </div>
      <div v-if="files.length" class="flex flex-wrap gap-2 px-3 pt-3">
        <div
          v-for="(f, i) in files"
          :key="f.name + i"
          class="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-default"
        >
          <span class="truncate max-w-40">{{ f.name }}</span>
          <UButton size="xs" variant="ghost" color="neutral" square icon="i-ph-x" :aria-label="`Remove ${f.name}`" @click="removeFile(i)" />
        </div>
      </div>
      <div class="flex items-end gap-1 px-1.5 min-h-11">
        <UTooltip text="Upload a file">
          <UButton
            icon="i-ph-plus"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            class="rounded-full mb-0! self-center"
            :disabled="disabled"
            aria-label="Attach files"
            @click="() => openFiles()"
          />
        </UTooltip>
        <UTextarea
          v-model="ui.composerDraft"
          autoresize
          :rows="1"
          :maxrows="8"
          variant="none"
          color="neutral"
          class="flex-1 self-stretch"
          :ui="{ base: () => 'w-full bg-transparent px-1 py-2.5 text-base leading-snug text-default placeholder:text-muted resize-none focus:outline-none' }"
          :placeholder="disabled ? 'You can no longer send messages to this user' : (placeholder || 'Message')"
          :disabled="disabled"
          @keydown="onKey"
        />
        <UPopover v-model:open="emojiOpen">
          <UButton
            icon="i-ph-smiley"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            class="mb-0! self-center"
            :disabled="disabled"
            aria-label="Emoji"
          />
          <template #content>
            <div class="p-2 grid grid-cols-4 gap-1">
              <UButton
                v-for="e in EMOJI"
                :key="e"
                variant="ghost"
                color="neutral"
                size="sm"
                square
                :label="e"
                @click="insertEmoji(e)"
              />
            </div>
          </template>
        </UPopover>
      </div>
    </div>
  </form>
</template>
