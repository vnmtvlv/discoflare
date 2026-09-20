<script setup lang="ts">
import type { ClientMsg, MemberDTO, MessageDTO } from '~~/shared/types'
import { formatAudioDuration } from '~~/shared/audio'
import { claimComposerSubmission, type ComposerSubmission } from '~~/shared/composer'
import { applyMentionTokens } from '~~/shared/mentions'
import { newId, nowIso } from '~~/shared/ids'
import { useQueryClient, type InfiniteData } from '@tanstack/vue-query'
import { useFileDialog } from '@vueuse/core'
import AttachmentDraftPreview from '~/features/attachments/components/AttachmentDraftPreview.vue'
import { useAudioRecorder } from '~/features/attachments/composables/useAudioRecorder'
import { createTypingActivity } from '~/utils/typing-activity'

const props = defineProps<{
  channelId: string
  workspaceId: string
  members: MemberDTO[]
  send: (msg: ClientMsg) => void
  placeholder?: string
  disabled?: boolean
  disabledPlaceholder?: string
  canAttach?: boolean
  agentBusy?: boolean
}>()

const emit = defineEmits<{ last: [] }>()

const ui = useUiStore()
const session = useSessionStore()
const qc = useQueryClient()
const toast = useToast()
const { api } = useApi()
const files = ref<File[]>([])
const emojiOpen = ref(false)
const agentMode = ref<'queue' | 'steer'>('queue')
const agentModes = [
  { label: 'Queue', value: 'queue' },
  { label: 'Steer', value: 'steer' },
]
const EMOJI = ['😀', '😂', '❤️', '👍', '🔥', '🎉', '👀', '💯']
const draft = computed({
  get: () => ui.composerState(props.channelId).draft,
  set: value => ui.setComposerDraft(props.channelId, value),
})
const replyToId = computed(() => ui.composerState(props.channelId).replyToId)
const editingId = computed(() => ui.composerState(props.channelId).editingId)

const { open: openFiles, reset: resetFiles, onChange } = useFileDialog({
  multiple: true,
  accept: '.png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.zip,.webm,.m4a,.ogg,.oga,.wav',
})
onChange((list) => {
  files.value = list ? Array.from(list) : []
})

const {
  recording,
  elapsedMs,
  start: startAudioRecording,
  stop: stopAudioRecording,
  cancel: cancelAudioRecording,
} = useAudioRecorder({
  onRecorded(file) {
    if (files.value.length >= 8) {
      toast.add({ title: 'A message can contain up to 8 attachments', color: 'error' })
      return
    }
    files.value = [...files.value, file]
  },
  onError(message) {
    toast.add({ title: message, color: 'error' })
  },
  onLimit() {
    toast.add({ title: 'Audio recording stopped at 5 minutes' })
  },
})
const recordingTime = computed(() => formatAudioDuration(elapsedMs.value))
const attachmentsDisabled = computed(() => props.disabled || props.canAttach === false)

function recordAudio() {
  if (attachmentsDisabled.value || editingId.value) return
  if (files.value.length >= 8) {
    toast.add({ title: 'A message can contain up to 8 attachments', color: 'error' })
    return
  }
  void startAudioRecording()
}

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
  if (props.disabled || recording.value) return
  if (files.value.length && props.canAttach === false) {
    toast.add({ title: 'You cannot attach files in this channel', color: 'error' })
    return
  }
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
  if (!content && !submission.files.length) return

  const clientId = submission.editingId ? null : newId()
  if (clientId) {
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
      pin: null,
      threadId: null,
      editedAt: null,
      deletedAt: null,
      createdAt: nowIso(),
      clientId,
      deliveryState: submission.files.length ? 'uploading' : 'sending',
    }
    qc.setQueryData<InfiniteData<{ messages: MessageDTO[]; nextCursor: string | null }>>(['messages', channelId], (old) => {
      if (!old?.pages?.length) return { pages: [{ messages: [optimistic], nextCursor: null }], pageParams: [undefined] }
      const pages = old.pages.map((p, i) => i === 0 ? { ...p, messages: [...p.messages, optimistic] } : p)
      return { ...old, pages }
    })
  }

  const attachmentIds: string[] = []
  try {
    for (const file of submission.files) {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api<{ attachment: { id: string } }>(`/api/channels/${channelId}/attachments`, {
        method: 'POST',
        body: fd,
      })
      attachmentIds.push(res.attachment.id)
    }
  }
  catch (err) {
    if (clientId) {
      qc.setQueryData<InfiniteData<{ messages: MessageDTO[]; nextCursor: string | null }>>(['messages', channelId], old => old
        ? {
            ...old,
            pages: old.pages.map(page => ({
              ...page,
              messages: page.messages.filter(message => message.clientId !== clientId),
            })),
          }
        : old)
    }
    restoreSubmission(channelId, submission)
    toast.add({ title: errorMessage(err), color: 'error' })
    return
  }

  if (submission.editingId) {
    try {
      await api(`/api/messages/${submission.editingId}`, { method: 'PATCH', body: { content } })
    }
    catch (err) {
      restoreSubmission(channelId, submission)
      toast.add({ title: errorMessage(err), color: 'error' })
    }
    return
  }

  if (!clientId || (!content && !attachmentIds.length)) return
  props.send({
    t: 'message.create',
    content,
    replyToId: submission.replyToId ?? undefined,
    clientId,
    attachmentIds: attachmentIds.length ? attachmentIds : undefined,
    agentMode: props.agentBusy ? agentMode.value : undefined,
  })
  agentMode.value = 'queue'
}

const typing = createTypingActivity(active => props.send({ t: 'typing', active }))

watch(draft, (value) => {
  if (!props.disabled && !editingId.value && value) typing.input()
  else typing.stop()
})
watch(() => [props.channelId, props.disabled, editingId.value], () => {
  typing.stop()
  if (recording.value) cancelAudioRecording()
})
onUnmounted(() => typing.stop())
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
            class="mb-0! size-11 self-center rounded-full md:size-8"
            :disabled="attachmentsDisabled || recording || Boolean(editingId)"
            aria-label="Attach files"
            @click="() => openFiles()"
          />
        </UTooltip>
        <div v-if="recording" class="flex min-w-0 flex-1 items-center gap-2 self-stretch px-2" aria-live="polite">
          <span class="size-2 shrink-0 animate-pulse rounded-full bg-error" />
          <span class="truncate text-sm text-default">Recording</span>
          <time class="font-mono text-sm tabular-nums text-muted">{{ recordingTime }}</time>
          <UTooltip text="Cancel recording">
            <UButton
              icon="i-ph-x"
              color="neutral"
              variant="ghost"
              size="sm"
              square
              class="ms-auto size-11 md:size-8"
              aria-label="Cancel recording"
              @click="cancelAudioRecording"
            />
          </UTooltip>
          <UTooltip text="Stop recording">
            <UButton
              icon="i-ph-stop"
              color="error"
              variant="soft"
              size="sm"
              square
              class="size-11 md:size-8"
              aria-label="Stop recording"
              @click="stopAudioRecording"
            />
          </UTooltip>
        </div>
        <UTextarea
          v-else
          v-model="draft"
          autoresize
          :rows="1"
          :maxrows="8"
          variant="none"
          color="neutral"
          class="flex-1 self-stretch"
          :ui="{ base: () => 'w-full bg-transparent px-1 py-2.5 text-base leading-snug text-default placeholder:text-muted resize-none focus:outline-none' }"
          :placeholder="disabled ? (disabledPlaceholder || 'You cannot send messages in this channel') : (placeholder || 'Message')"
          :disabled="disabled"
          @keydown="onKey"
        />
        <UPopover v-if="!recording" v-model:open="emojiOpen">
          <UButton
            icon="i-ph-smiley"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            class="mb-0! size-11 self-center md:size-8"
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
        <UTooltip v-if="!recording && !editingId" text="Record audio">
          <UButton
            icon="i-ph-microphone"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            class="mb-0! size-11 self-center md:size-8"
            :disabled="attachmentsDisabled"
            aria-label="Record audio"
            @click="recordAudio"
          />
        </UTooltip>
        <USelect
          v-if="!recording && !editingId && agentBusy"
          v-model="agentMode"
          :items="agentModes"
          value-key="value"
          size="xs"
          variant="ghost"
          class="w-20 self-center"
          aria-label="Agent message mode"
        />
        <UTooltip v-if="!recording && (draft.trim() || files.length)" text="Send">
          <UButton
            type="submit"
            icon="i-ph-paper-plane-tilt"
            color="primary"
            variant="ghost"
            size="sm"
            square
            class="mb-0! size-11 self-center md:size-8"
            :disabled="disabled"
            aria-label="Send message"
          />
        </UTooltip>
      </div>
    </div>
  </form>
</template>
