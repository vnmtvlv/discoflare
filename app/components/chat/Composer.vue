<script setup lang="ts">
import type { ClientMsg, MemberDTO, MessageDTO } from '~~/shared/types'
import { claimComposerSubmission, type ComposerSubmission } from '~~/shared/composer'
import { applyMentionTokens } from '~~/shared/mentions'
import { newId, nowIso } from '~~/shared/ids'
import { useQueryClient, type InfiniteData } from '@tanstack/vue-query'
import { useDebounceFn, useFileDialog } from '@vueuse/core'
import AttachmentDraftPreview from '~/features/attachments/components/AttachmentDraftPreview.vue'

const props = defineProps<{
  channelId: string
  workspaceId: string
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
const draft = computed({
  get: () => ui.composerState(props.channelId).draft,
  set: value => ui.setComposerDraft(props.channelId, value),
})
const replyToId = computed(() => ui.composerState(props.channelId).replyToId)
const editingId = computed(() => ui.composerState(props.channelId).editingId)

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
    ui.cancelComposerIntent(props.channelId)
  }
  if (e.key === 'ArrowUp' && !draft.value && !e.shiftKey) emit('last')
}

function insertEmoji(e: string) {
  draft.value = `${draft.value || ''}${e}`
  emojiOpen.value = false
}

function removeFile(i: number) {
  files.value = files.value.filter((_, idx) => idx !== i)
}

function restoreSubmission(channelId: string, submission: ComposerSubmission<File>) {
  const state = ui.composerState(channelId)
  if (!state.draft && !state.replyToId && !state.editingId) {
    if (submission.editingId) ui.startEditing(channelId, submission.editingId, submission.draft)
    else {
      ui.setComposerDraft(channelId, submission.draft)
      if (submission.replyToId) ui.startReply(channelId, submission.replyToId)
    }
  }
  if (props.channelId === channelId) files.value = [...submission.files, ...files.value].slice(0, 8)
}

async function submit() {
  if (props.disabled) return
  const channelId = props.channelId
  const submission = claimComposerSubmission<File>({
    read: () => ({
      draft: draft.value,
      files: files.value,
      replyToId: replyToId.value,
      editingId: editingId.value,
    }),
    clear: () => {
      ui.clearComposer(channelId)
      files.value = []
      resetFiles()
    },
  })
  if (!submission) return

  let content = applyMentionTokens(submission.draft, props.members.map((m) => ({
    id: m.user.id,
    displayName: m.user.displayName,
    nickname: m.nickname,
  })))
  content = content.trim()
  const attachmentIds: string[] = []
  try {
    for (const file of submission.files) {
      const fd = new FormData()
      fd.append('file', file)
      const res = await $fetch<{ attachment: { id: string } }>(`/api/channels/${channelId}/attachments`, {
        method: 'POST',
        body: fd,
      })
      attachmentIds.push(res.attachment.id)
    }
  }
  catch (err) {
    restoreSubmission(channelId, submission)
    toast.add({ title: errorMessage(err), color: 'error' })
    return
  }

  if (submission.editingId) {
    try {
      await $fetch(`/api/messages/${submission.editingId}`, { method: 'PATCH', body: { content } })
    }
    catch (err) {
      restoreSubmission(channelId, submission)
      toast.add({ title: errorMessage(err), color: 'error' })
    }
    return
  }

  if (!content && !attachmentIds.length) return
  const clientId = newId()
  const optimistic: MessageDTO = {
    id: `tmp:${clientId}`,
    channelId,
    workspaceId: props.workspaceId,
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
  qc.setQueryData<InfiniteData<{ messages: MessageDTO[]; nextCursor: string | null }>>(['messages', channelId], (old) => {
    if (!old?.pages?.length) return { pages: [{ messages: [optimistic], nextCursor: null }], pageParams: [undefined] }
    const pages = old.pages.map((p, i) => i === 0 ? { ...p, messages: [...p.messages, optimistic] } : p)
    return { ...old, pages }
  })
  props.send({ t: 'message.create', content, replyToId: submission.replyToId ?? undefined, clientId, attachmentIds: attachmentIds.length ? attachmentIds : undefined })
}

const pingTyping = useDebounceFn(() => {
  if (!props.disabled && draft.value) props.send({ t: 'typing' })
}, 400)

watch(draft, () => { pingTyping() })
</script>

<template>
  <form class="px-4 pb-6 pt-2" @submit.prevent="submit">
    <div
      class="df-composer overflow-hidden"
      :class="replyToId || editingId ? 'rounded-b-lg' : 'rounded-lg'"
    >
      <div v-if="replyToId" class="flex items-center gap-2 px-3 py-2 bg-muted text-xs text-muted">
        <span class="flex-1">Replying to message</span>
        <UButton size="xs" color="neutral" variant="ghost" square icon="i-ph-x" aria-label="Cancel reply" @click="ui.cancelComposerIntent(channelId)" />
      </div>
      <div v-else-if="editingId" class="flex items-center gap-2 px-3 py-2 bg-muted text-xs text-primary">
        <span class="flex-1">Editing message</span>
        <UButton size="xs" color="neutral" variant="ghost" square icon="i-ph-x" aria-label="Cancel edit" @click="ui.cancelComposerIntent(channelId, true)" />
      </div>
      <AttachmentDraftPreview v-if="files.length" :files="files" @remove="removeFile" />
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
          v-model="draft"
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
