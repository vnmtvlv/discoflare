<script setup lang="ts">
import type { ChannelThreadDTO, MessageDTO } from '~~/shared/types'
import { formatMessageTime, formatTime } from '~~/shared/format'
import AttachmentGallery from '~/features/attachments/components/AttachmentGallery.vue'

const props = defineProps<{
  message: MessageDTO
  thread?: ChannelThreadDTO
  names: Record<string, string>
  mine: boolean
  canPin?: boolean
  /** Show Start/Open thread actions. */
  canThread?: boolean
  compact?: boolean
  streaming?: boolean
}>()
const emit = defineEmits<{
  reply: []
  edit: []
  remove: []
  thread: []
  jump: [id: string]
  react: [emoji: string]
  pin: []
  retry: []
}>()

const EMOJI = ['👍', '❤️', '😂']
const SHEET_EMOJI = ['👍', '❤️', '😂', '😮', '😢', '🙏']

// Phones cannot hover, so the toolbar is unreachable there. A long press opens
// the same actions in a bottom sheet instead.
const actionsOpen = ref(false)
let pressTimer: ReturnType<typeof setTimeout> | undefined
let pressStart: { x: number, y: number } | null = null
const actionable = computed(() => !props.message.deletedAt && !props.message.id.startsWith('tmp:'))

function onTouchStart(event: TouchEvent) {
  if (!actionable.value || event.touches.length !== 1) return
  const target = event.target as Element | null
  if (target?.closest('a, button, video, audio, input, textarea')) return
  const touch = event.touches[0]!
  pressStart = { x: touch.clientX, y: touch.clientY }
  clearTimeout(pressTimer)
  pressTimer = setTimeout(() => {
    pressStart = null
    actionsOpen.value = true
    navigator.vibrate?.(10)
  }, 450)
}

function onTouchMove(event: TouchEvent) {
  if (!pressStart) return
  const touch = event.touches[0]!
  if (Math.hypot(touch.clientX - pressStart.x, touch.clientY - pressStart.y) > 10) cancelPress()
}

function cancelPress() {
  clearTimeout(pressTimer)
  pressStart = null
}

onBeforeUnmount(cancelPress)

function run(action: () => void) {
  actionsOpen.value = false
  action()
}

const toast = useToast()
async function copyText() {
  actionsOpen.value = false
  try {
    await navigator.clipboard.writeText(props.message.content)
    toast.add({ title: 'Copied', color: 'success' })
  }
  catch {
    toast.add({ title: 'Could not copy', color: 'error' })
  }
}

function replySummary(reply: NonNullable<MessageDTO['replyTo']>) {
  if (reply.deleted) return 'Deleted message'
  if (reply.content.trim()) return reply.content
  if (reply.attachmentCount === 1) return 'Attachment'
  if (reply.attachmentCount > 1) return `${reply.attachmentCount} attachments`
  return 'Message'
}
</script>

<template>
  <article
    class="message-row group relative px-4 flex gap-4"
    :class="[compact ? 'py-0.5 hover:bg-elevated/40' : 'mt-4 py-0.5 hover:bg-elevated/40', actionsOpen ? 'bg-elevated/60' : '']"
    @touchstart.passive="onTouchStart"
    @touchmove.passive="onTouchMove"
    @touchend.passive="cancelPress"
    @touchcancel.passive="cancelPress"
    @contextmenu="(event) => { if (actionsOpen) event.preventDefault() }"
  >
    <div class="w-10 shrink-0 flex justify-center">
      <UserAvatar
        v-if="!compact"
        :user="message.author"
        size="md"
        class="mt-0.5"
      />
      <time
        v-else
        class="text-[10px] text-muted leading-6 opacity-0 group-hover:opacity-100"
        :datetime="message.createdAt"
      >{{ formatTime(message.createdAt) }}</time>
    </div>
    <div class="min-w-0 flex-1">
      <div v-if="!compact" class="flex items-baseline gap-2 leading-5">
        <span class="font-medium text-highlighted hover:underline cursor-default">{{ message.author.displayName }}</span>
        <time class="text-xs text-muted" :datetime="message.createdAt">{{ formatMessageTime(message.createdAt) }}</time>
        <span v-if="message.editedAt" class="text-xs text-muted">(edited)</span>
      </div>
      <button
        v-if="message.replyTo"
        type="button"
        class="my-1 -ml-1 flex w-fit max-w-full items-center gap-1.5 rounded px-1 py-0.5 text-xs text-muted hover:bg-elevated hover:text-default"
        :aria-label="`Jump to reply from ${names[message.replyTo.authorId] || 'member'}`"
        @click="emit('jump', message.replyTo.id)"
      >
        <UIcon name="i-ph-arrow-bend-up-left" class="size-3.5 shrink-0 text-toned" />
        <span class="shrink-0 font-medium text-toned">{{ names[message.replyTo.authorId] || 'member' }}</span>
        <UIcon v-if="!message.replyTo.deleted && !message.replyTo.content.trim() && message.replyTo.attachmentCount" name="i-ph-paperclip" class="size-3.5 shrink-0" />
        <span class="truncate">{{ replySummary(message.replyTo) }}</span>
      </button>
      <p v-if="message.deletedAt" class="text-muted italic text-base">Message deleted</p>
      <div v-else>
        <ChatMarkdownView :content="message.content" :names="names" />
        <span v-if="streaming" class="inline-block h-4 w-0.5 animate-pulse bg-primary align-text-bottom" aria-label="Streaming" />
      </div>
      <AttachmentGallery v-if="message.attachments.length" :attachments="message.attachments" />
      <div v-if="message.deliveryState" class="mt-0.5 flex h-5 items-center gap-1.5 text-xs" aria-live="polite">
        <template v-if="message.deliveryState !== 'failed'">
          <UIcon name="i-ph-circle-notch" class="size-3 animate-spin text-muted" />
          <span class="text-muted">{{ message.deliveryState === 'uploading' ? 'Uploading' : 'Sending' }}</span>
        </template>
        <UButton
          v-else
          size="xs"
          color="error"
          variant="link"
          icon="i-ph-arrow-clockwise"
          label="Retry"
          class="px-0"
          @click="emit('retry')"
        />
      </div>
      <div v-if="message.reactions?.length" class="mt-1 flex flex-wrap gap-1">
        <UButton
          v-for="r in message.reactions"
          :key="r.emoji"
          size="xs"
          :variant="r.me ? 'soft' : 'subtle'"
          color="neutral"
          :label="`${r.emoji} ${r.count}`"
          class="rounded-md"
          @click="emit('react', r.emoji)"
        />
      </div>
      <div v-if="message.threadId" class="relative mt-2 ml-5 max-w-xl">
        <span
          class="pointer-events-none absolute -left-5 -top-3 h-8 w-4 rounded-bl-lg border-l-2 border-b-2 border-muted"
          aria-hidden="true"
        />
        <button
          type="button"
          class="group/thread flex w-full items-center gap-3 rounded-md border border-default bg-elevated px-3 py-2 text-start transition-colors hover:border-accented hover:bg-accented/60"
          @click="emit('thread')"
        >
          <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-accented text-primary">
            <UIcon name="i-ph-chats-circle" class="size-5" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium text-highlighted">{{ thread?.title || 'Thread' }}</span>
            <span class="mt-0.5 flex items-center gap-1.5 text-xs">
              <span class="font-semibold text-primary">
                {{ thread ? `${thread.replyCount} ${thread.replyCount === 1 ? 'reply' : 'replies'}` : 'Open thread' }}
              </span>
              <span v-if="thread?.lastReplyAt" class="truncate text-muted">Last reply {{ formatMessageTime(thread.lastReplyAt) }}</span>
            </span>
          </span>
          <UIcon name="i-ph-caret-right" class="size-4 shrink-0 text-muted transition-transform group-hover/thread:translate-x-0.5" />
        </button>
      </div>
    </div>
    <!-- Hover toolbar for mouse and keyboard; touch screens use the long-press sheet. -->
    <div
      v-if="actionable"
      class="absolute right-4 -top-5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 flex bg-elevated ring ring-default rounded-md shadow-sm z-10 pointer-coarse:hidden"
    >
      <UTooltip v-for="e in EMOJI" :key="e" :text="`React with ${e}`">
        <UButton size="sm" variant="ghost" color="neutral" :label="e" :aria-label="`React with ${e}`" @click="emit('react', e)" />
      </UTooltip>
      <UTooltip text="Reply">
        <UButton size="sm" variant="ghost" color="neutral" icon="i-ph-arrow-bend-up-left" aria-label="Reply" @click="emit('reply')" />
      </UTooltip>
      <UTooltip v-if="canThread" :text="message.threadId ? 'Open thread' : 'Start thread'">
        <UButton size="sm" variant="ghost" color="neutral" icon="i-ph-chats" :aria-label="message.threadId ? 'Open thread' : 'Start thread'" @click="emit('thread')" />
      </UTooltip>
      <UTooltip v-if="canPin" :text="message.pin ? 'Unpin message' : 'Pin message'">
        <UButton
          size="sm"
          :variant="message.pin ? 'soft' : 'ghost'"
          :color="message.pin ? 'primary' : 'neutral'"
          icon="i-ph-push-pin"
          :aria-label="message.pin ? 'Unpin message' : 'Pin message'"
          :aria-pressed="Boolean(message.pin)"
          @click="emit('pin')"
        />
      </UTooltip>
      <UTooltip v-if="mine" text="Edit">
        <UButton size="sm" variant="ghost" color="neutral" icon="i-ph-pencil-simple" aria-label="Edit" @click="emit('edit')" />
      </UTooltip>
      <UTooltip v-if="mine" text="Delete">
        <UButton size="sm" variant="ghost" color="error" icon="i-ph-trash" aria-label="Delete" @click="emit('remove')" />
      </UTooltip>
    </div>
    <UDrawer v-if="actionable" v-model:open="actionsOpen" :title="`Message from ${message.author.displayName}`" :ui="{ title: 'sr-only', header: 'hidden' }">
      <template #body>
        <div class="flex justify-between gap-1 pb-3">
          <button
            v-for="e in SHEET_EMOJI"
            :key="e"
            type="button"
            class="flex size-12 items-center justify-center rounded-full bg-elevated text-2xl active:bg-accented"
            :aria-label="`React with ${e}`"
            @click="run(() => emit('react', e))"
          >
            {{ e }}
          </button>
        </div>
        <div class="divide-y divide-default overflow-hidden rounded-xl bg-elevated">
          <button type="button" class="sheet-action" @click="run(() => emit('reply'))">
            <UIcon name="i-ph-arrow-bend-up-left" class="size-5" />Reply
          </button>
          <button v-if="canThread" type="button" class="sheet-action" @click="run(() => emit('thread'))">
            <UIcon name="i-ph-chats" class="size-5" />{{ message.threadId ? 'Open thread' : 'Start thread' }}
          </button>
          <button v-if="canPin" type="button" class="sheet-action" @click="run(() => emit('pin'))">
            <UIcon name="i-ph-push-pin" class="size-5" />{{ message.pin ? 'Unpin message' : 'Pin message' }}
          </button>
          <button v-if="message.content.trim()" type="button" class="sheet-action" @click="copyText">
            <UIcon name="i-ph-copy" class="size-5" />Copy text
          </button>
          <button v-if="mine" type="button" class="sheet-action" @click="run(() => emit('edit'))">
            <UIcon name="i-ph-pencil-simple" class="size-5" />Edit
          </button>
          <button v-if="mine" type="button" class="sheet-action text-error" @click="run(() => emit('remove'))">
            <UIcon name="i-ph-trash" class="size-5" />Delete
          </button>
        </div>
      </template>
    </UDrawer>
  </article>
</template>

<style scoped>
/* On touch screens a long press opens the action sheet; keep the system callout
   and text selection from competing with it (the sheet offers Copy text). */
@media (pointer: coarse) {
  .message-row {
    -webkit-touch-callout: none;
    user-select: none;
  }
}

.sheet-action {
  display: flex;
  width: 100%;
  min-height: 3.25rem;
  align-items: center;
  gap: 0.875rem;
  padding-inline: 1rem;
  text-align: start;
  font-size: 0.9375rem;
}

.sheet-action:active {
  background: var(--ui-bg-accented);
}
</style>
