<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import type { MailboxDTO } from '~~/shared/types'
import { mailPath } from '~~/shared/paths'

definePageMeta({ middleware: ['auth'] })

const { workspaceId } = useWorkspace()
const { api } = useApi()

const mailboxesQ = useQuery({
  queryKey: ['mailboxes'],
  queryFn: () => api<{ mailboxes: MailboxDTO[] }>('/api/mail/mailboxes'),
})

watch(() => mailboxesQ.data.value?.mailboxes, (mailboxes) => {
  const first = mailboxes?.[0]
  if (first) void navigateTo(mailPath(first.channelId), { replace: true })
}, { immediate: true })
</script>

<template>
  <LayoutAppShell :workspace-id="workspaceId || undefined">
    <div class="grid flex-1 place-items-center p-6">
      <USkeleton v-if="mailboxesQ.isPending.value" class="h-24 w-64" />
      <div v-else-if="!mailboxesQ.data.value?.mailboxes.length" class="max-w-sm text-center">
        <UIcon name="i-ph-envelope-simple" class="size-8 text-dimmed" />
        <p class="mt-3 font-medium text-highlighted">No mailbox assigned</p>
        <p class="mt-1 text-sm text-muted">Ask a workspace admin to give you access to a mailbox in workspace settings.</p>
      </div>
    </div>
  </LayoutAppShell>
</template>
