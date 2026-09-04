<script setup lang="ts">
import type { MessageDTO } from '~~/shared/types'
import { formatMessageTime, formatTime } from '~~/shared/format'
import AttachmentGallery from '~/features/attachments/components/AttachmentGallery.vue'

defineProps<{
  message: MessageDTO
  names: Record<string, string>
  mine: boolean
  canPin?: boolean
  compact?: boolean
}>()
const emit = defineEmits<{
  reply: []
  edit: []
  remove: []
  thread: []
  jump: [id: string]
  react: [emoji: string]
  pin: []
}>()

const EMOJI = ['👍', '❤️', '😂']

function replySummary(reply: NonNullable<MessageDTO['replyTo']>) {
  if (reply.deleted) return 'Deleted message'
  if (reply.content.trim()) return reply.content
  if (reply.attachmentCount === 1) return 'Attachment'
  if (reply.attachmentCount > 1) return `${reply.attachmentCount} attachments`
  return 'Message'
}
</script>

<template>
  <article class="group relative px-4 flex gap-4" :class="compact ? 'py-0.5 hover:bg-elevated/40' : 'mt-4 py-0.5 hover:bg-elevated/40'">
    <div class="w-10 shrink-0 flex justify-center">
      <UAvatar
        v-if="!compact"
        size="md"
        :text="message.author.displayName.slice(0, 1).toUpperCase()"
        :alt="message.author.displayName"
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
      <ChatMarkdownView v-else :content="message.content" :names="names" />
      <AttachmentGallery v-if="message.attachments.length" :attachments="message.attachments" />
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
      <UButton v-if="message.threadId" size="xs" variant="link" label="Open thread" class="mt-1" @click="emit('thread')" />
    </div>
    <div
      v-if="!message.deletedAt"
      class="absolute right-4 -top-5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 flex bg-elevated ring ring-default rounded-md shadow-sm z-10"
    >
      <UTooltip v-for="e in EMOJI" :key="e" :text="`React with ${e}`">
        <UButton size="sm" variant="ghost" color="neutral" :label="e" :aria-label="`React with ${e}`" @click="emit('react', e)" />
      </UTooltip>
      <UTooltip text="Reply">
        <UButton size="sm" variant="ghost" color="neutral" icon="i-ph-arrow-bend-up-left" aria-label="Reply" @click="emit('reply')" />
      </UTooltip>
      <UTooltip :text="message.threadId ? 'Open thread' : 'Start thread'">
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
  </article>
</template>
