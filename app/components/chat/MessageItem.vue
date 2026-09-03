<script setup lang="ts">
import type { MessageDTO } from '~~/shared/types'
import { formatBytes, formatMessageTime, formatTime } from '~~/shared/format'

defineProps<{
  message: MessageDTO
  names: Record<string, string>
  mine: boolean
  compact?: boolean
}>()
const emit = defineEmits<{
  reply: []
  edit: []
  remove: []
  thread: []
  react: [emoji: string]
}>()

const EMOJI = ['👍', '❤️', '😂']
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
      <div v-if="message.replyTo" class="text-xs text-muted border-l-2 border-primary pl-2 my-1 truncate">
        {{ names[message.replyTo.authorId] || 'member' }}: {{ message.replyTo.content }}
      </div>
      <p v-if="message.deletedAt" class="text-muted italic text-base">Message deleted</p>
      <ChatMarkdownView v-else :content="message.content" :names="names" />
      <div v-if="message.attachments.length" class="mt-2 flex flex-col gap-2">
        <template v-for="a in message.attachments" :key="a.id">
          <img v-if="a.contentType.startsWith('image/')" :src="a.url" :alt="a.filename" class="max-h-64 rounded-md">
          <ULink v-else :to="a.url" target="_blank">{{ a.filename }} ({{ formatBytes(a.sizeBytes) }})</ULink>
        </template>
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
      <UButton v-if="message.threadId" size="xs" variant="link" label="View thread" class="mt-1" @click="emit('thread')" />
    </div>
    <div
      v-if="!message.deletedAt"
      class="absolute right-4 -top-4 opacity-0 group-hover:opacity-100 flex bg-elevated ring ring-default rounded-md shadow-sm z-10"
    >
      <UButton v-for="e in EMOJI" :key="e" size="xs" variant="ghost" color="neutral" :label="e" @click="emit('react', e)" />
      <UButton size="xs" variant="ghost" color="neutral" icon="i-ph-arrow-bend-up-left" aria-label="Reply" @click="emit('reply')" />
      <UButton size="xs" variant="ghost" color="neutral" icon="i-ph-chats" aria-label="Start thread" @click="emit('thread')" />
      <UButton v-if="mine" size="xs" variant="ghost" color="neutral" icon="i-ph-pencil-simple" aria-label="Edit" @click="emit('edit')" />
      <UButton v-if="mine" size="xs" variant="ghost" color="error" icon="i-ph-trash" aria-label="Delete" @click="emit('remove')" />
    </div>
  </article>
</template>
