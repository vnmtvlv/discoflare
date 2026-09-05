<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { MailboxDTO, MailMessageDTO, MailThreadDTO, MailThreadStatus } from '~~/shared/types'
import { formatDateTime } from '~~/shared/format'
import { isMailFolder, mailPath } from '~~/shared/paths'

definePageMeta({ middleware: ['auth'] })

const { workspaceId } = useWorkspace()
const { api, serverUrl } = useApi()
const route = useRoute()
const qc = useQueryClient()
const toast = useToast()
const nav = useNavActions()

/** Mailbox, folder and open thread all live in the URL so the sidebar can link to them. */
const activeMailboxId = computed(() => String(route.params.mailbox || '') || null)
const folder = computed<MailThreadStatus>(() => {
  const value = String(route.params.folder || 'inbox')
  return isMailFolder(value) ? value : 'inbox'
})
const activeThreadId = computed(() => String(route.query.thread || '') || null)

const composerMode = ref<'reply' | 'note'>('reply')
const draft = ref('')
const sending = ref(false)
const composeTo = ref('')
const composeSubject = ref('')
const composeBody = ref('')

function openThread(threadId: string | null) {
  void navigateTo({ query: threadId ? { thread: threadId } : {} })
}

const mailboxesQ = useQuery({
  queryKey: ['mailboxes'],
  queryFn: () => api<{ mailboxes: MailboxDTO[] }>('/api/mail/mailboxes'),
  refetchInterval: 15_000,
})
const mailboxes = computed(() => mailboxesQ.data.value?.mailboxes ?? [])
const activeMailbox = computed(() => mailboxes.value.find(mailbox => mailbox.channelId === activeMailboxId.value) ?? null)
const canSend = computed(() => activeMailbox.value?.permission === 'send' || activeMailbox.value?.permission === 'manage')
const threadsQ = useQuery({
  queryKey: computed(() => ['mail-threads', activeMailboxId.value, folder.value]),
  queryFn: () => api<{ threads: MailThreadDTO[] }>(`/api/mail/mailboxes/${activeMailboxId.value}/threads?status=${folder.value}`),
  enabled: computed(() => Boolean(activeMailboxId.value)),
  refetchInterval: 15_000,
})
const threads = computed(() => threadsQ.data.value?.threads ?? [])
const threadQ = useQuery({
  queryKey: computed(() => ['mail-thread', activeThreadId.value]),
  queryFn: () => api<{ thread: MailThreadDTO; messages: MailMessageDTO[] }>(`/api/mail/threads/${activeThreadId.value}`),
  enabled: computed(() => Boolean(activeThreadId.value)),
  refetchInterval: 15_000,
})
const thread = computed(() => threadQ.data.value?.thread ?? null)
const messages = computed(() => threadQ.data.value?.messages ?? [])

/** A mailbox that disappeared (access revoked, renamed) shouldn't leave a dead URL. */
watch([mailboxes, activeMailboxId], ([items, id]) => {
  if (!items.length || !id) return
  if (!items.some(item => item.channelId === id)) void navigateTo(mailPath(items[0]!.channelId), { replace: true })
}, { immediate: true })

watch([threads, activeThreadId], ([items, id]) => {
  if (!id || !items.length) return
  if (!items.some(item => item.channelId === id)) openThread(null)
})

watch(activeThreadId, () => {
  draft.value = ''
  composerMode.value = 'reply'
})

async function send() {
  if (!activeThreadId.value || !draft.value.trim() || !canSend.value) return
  sending.value = true
  try {
    await api(`/api/mail/threads/${activeThreadId.value}/${composerMode.value}`, {
      method: 'POST',
      body: { content: draft.value.trim() },
    })
    draft.value = ''
    await Promise.all([
      threadQ.refetch(),
      qc.invalidateQueries({ queryKey: ['mail-threads', activeMailboxId.value] }),
    ])
  }
  catch (error) {
    toast.add({ title: errorMessage(error), color: 'error' })
  }
  finally { sending.value = false }
}

async function move(status: MailThreadStatus) {
  if (!activeThreadId.value) return
  try {
    await api(`/api/mail/threads/${activeThreadId.value}`, { method: 'PATCH', body: { status } })
    await qc.invalidateQueries({ queryKey: ['mail-threads', activeMailboxId.value] })
    openThread(null)
  }
  catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
}

async function compose() {
  if (!activeMailboxId.value || !canSend.value || !composeSubject.value.trim() || !composeBody.value.trim()) return
  const to = [...new Set(composeTo.value.split(/[;,\s]+/u).map(value => value.trim()).filter(Boolean))]
  if (!to.length) return
  sending.value = true
  try {
    const result = await api<{ threadId: string }>(`/api/mail/mailboxes/${activeMailboxId.value}/send`, {
      method: 'POST',
      body: { to, subject: composeSubject.value.trim(), content: composeBody.value.trim() },
    })
    nav.composeOpen.value = false
    composeTo.value = ''
    composeSubject.value = ''
    composeBody.value = ''
    await qc.invalidateQueries({ queryKey: ['mail-threads', activeMailboxId.value] })
    await navigateTo(mailPath(activeMailboxId.value, 'inbox', result.threadId))
  }
  catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
  finally { sending.value = false }
}

const folderLabel = computed(() => folder.value.charAt(0).toUpperCase() + folder.value.slice(1))

function messageSender(message: MailMessageDTO) {
  if (!message.email) return message.author.displayName
  if (message.email.direction === 'outbound') return activeMailbox.value?.displayName || message.email.fromAddress
  return message.email.fromName || message.email.fromAddress
}

</script>

<template>
  <LayoutAppShell :workspace-id="workspaceId || undefined">
    <div class="grid h-full min-h-0 min-w-0 grid-cols-1 md:grid-cols-[320px_minmax(0,1fr)]">
      <section class="min-h-0 overflow-y-auto border-e border-default" :class="activeThreadId ? 'hidden md:block' : 'block'">
        <div class="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-default bg-default/90 px-3 backdrop-blur">
          <UButton icon="i-ph-list" color="neutral" variant="ghost" square aria-label="Open navigation" @click="useUiStore().mobilePane = 'channels'" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-highlighted">{{ folderLabel }}</p>
            <p class="truncate text-[11px] text-muted">{{ activeMailbox?.address || 'Mail' }}</p>
          </div>
          <UButton v-if="canSend" label="Compose" trailing-icon="i-ph-pencil-simple" size="sm" @click="nav.composeOpen.value = true" />
        </div>
        <USkeleton v-if="threadsQ.isPending.value" class="m-4 h-24" />
        <UAlert v-else-if="!mailboxes.length" class="m-4" color="neutral" title="No mailbox assigned" />
        <UAlert v-else-if="!threads.length" class="m-4" color="neutral" :title="`No messages in ${folder}`" />
        <button
          v-for="item in threads"
          :key="item.channelId"
          type="button"
          class="block w-full border-b border-default px-4 py-3 text-start hover:bg-elevated/60"
          :class="item.channelId === activeThreadId ? 'bg-accented' : ''"
          @click="openThread(item.channelId)"
        >
          <div class="flex items-baseline gap-2">
            <span class="min-w-0 flex-1 truncate text-sm" :class="item.unread ? 'font-semibold text-highlighted' : 'text-default'">{{ item.participants.join(', ') || 'Unknown sender' }}</span>
            <span class="shrink-0 text-[11px] text-muted">{{ formatDateTime(item.lastMessageAt) }}</span>
          </div>
          <p class="mt-0.5 truncate text-sm" :class="item.unread ? 'font-medium text-highlighted' : 'text-default'">{{ item.subject }}</p>
          <p class="mt-0.5 line-clamp-2 text-xs text-muted">{{ item.preview }}</p>
        </button>
      </section>

      <section class="flex min-h-0 min-w-0 flex-col" :class="activeThreadId ? 'flex' : 'hidden md:flex'">
        <template v-if="thread">
          <header class="flex min-h-12 items-center gap-2 border-b border-default px-3">
            <UButton icon="i-ph-arrow-left" color="neutral" variant="ghost" square class="md:hidden" aria-label="Back to mail" @click="openThread(null)" />
            <div class="min-w-0 flex-1">
              <h2 class="truncate text-sm font-semibold text-highlighted">{{ thread.subject }}</h2>
              <p class="truncate text-xs text-muted">{{ thread.participants.join(', ') }}</p>
            </div>
            <UTooltip text="Archive"><UButton icon="i-ph-archive" color="neutral" variant="ghost" square :disabled="!canSend" @click="move('archive')" /></UTooltip>
            <UTooltip text="Spam"><UButton icon="i-ph-warning" color="neutral" variant="ghost" square :disabled="!canSend" @click="move('spam')" /></UTooltip>
            <UTooltip text="Trash"><UButton icon="i-ph-trash" color="neutral" variant="ghost" square :disabled="!canSend" @click="move('trash')" /></UTooltip>
          </header>
          <div class="flex-1 space-y-3 overflow-y-auto p-4 md:p-6">
            <article v-for="message in messages" :key="message.id" class="rounded-lg border border-default bg-default p-4">
              <div class="flex items-start gap-3">
                <UserAvatar :user="message.author" size="sm" />
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-baseline gap-x-2">
                    <span class="font-medium text-highlighted">{{ messageSender(message) }}</span>
                    <UBadge v-if="!message.email" label="Internal note" color="warning" variant="subtle" size="sm" />
                    <UBadge v-else-if="message.email.direction === 'outbound'" label="Sent" color="neutral" variant="subtle" size="sm" />
                    <span class="text-xs text-muted">{{ formatDateTime(message.createdAt) }}</span>
                  </div>
                  <p v-if="message.email" class="mt-0.5 truncate text-xs text-muted">
                    {{ message.email.direction === 'outbound' ? `To ${message.email.to.join(', ')}` : `From ${message.email.fromAddress}` }}
                  </p>
                </div>
              </div>
              <p class="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-default">{{ message.content }}</p>
              <div v-if="message.attachments.length" class="mt-4 flex flex-wrap gap-2">
                <UButton
                  v-for="attachment in message.attachments"
                  :key="attachment.id"
                  :to="serverUrl(attachment.url)"
                  target="_blank"
                  :label="attachment.filename"
                  icon="i-ph-paperclip"
                  color="neutral"
                  variant="soft"
                  size="sm"
                />
              </div>
            </article>
          </div>
          <form v-if="canSend" class="border-t border-default p-3" @submit.prevent="send">
            <div class="mb-2 flex items-center gap-1">
              <UButton label="Reply" size="xs" color="neutral" :variant="composerMode === 'reply' ? 'soft' : 'ghost'" @click="composerMode = 'reply'" />
              <UButton label="Internal note" size="xs" color="warning" :variant="composerMode === 'note' ? 'soft' : 'ghost'" @click="composerMode = 'note'" />
            </div>
            <UTextarea v-model="draft" :placeholder="composerMode === 'reply' ? 'Reply by email' : 'Write a note for the workspace'" autoresize :maxrows="8" class="w-full" />
            <div class="mt-2 flex justify-end">
              <UButton type="submit" :label="composerMode === 'reply' ? 'Send reply' : 'Add note'" trailing-icon="i-ph-paper-plane-tilt" :loading="sending" :disabled="!draft.trim()" />
            </div>
          </form>
          <div v-else class="border-t border-default p-4 text-sm text-muted">Read only</div>
        </template>
        <div v-else class="grid flex-1 place-items-center text-sm text-muted">Choose a conversation</div>
      </section>
    </div>

    <UModal v-model:open="nav.composeOpen.value" title="New email">
      <template #body>
        <div class="space-y-4">
          <UFormField label="To" hint="Separate addresses with commas"><UInput v-model="composeTo" type="text" autofocus class="w-full" /></UFormField>
          <UFormField label="Subject"><UInput v-model="composeSubject" class="w-full" /></UFormField>
          <UFormField label="Message"><UTextarea v-model="composeBody" :rows="8" class="w-full" /></UFormField>
        </div>
      </template>
      <template #footer>
        <UButton label="Cancel" color="neutral" variant="ghost" @click="nav.composeOpen.value = false" />
        <UButton label="Send email" trailing-icon="i-ph-paper-plane-tilt" :loading="sending" :disabled="!composeTo.trim() || !composeSubject.trim() || !composeBody.trim()" @click="compose" />
      </template>
    </UModal>
  </LayoutAppShell>
</template>
