<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import type { InstallationManagementStatusDTO } from '~~/shared/releases'

const props = defineProps<{ workspaceId: string }>()

const managementQ = useQuery({
  queryKey: computed(() => ['installation-management', props.workspaceId]),
  queryFn: () => $fetch<InstallationManagementStatusDTO>(`/api/workspaces/${props.workspaceId}/management`),
})

const status = computed(() => managementQ.data.value)
const adminUrl = computed(() => {
  const url = new URL('/admin', 'https://discoflare.com')
  if (status.value?.hostname) url.searchParams.set('installation', `https://${status.value.hostname}`)
  return url.toString()
})
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold text-highlighted">Cloudflare</h1>
    <p class="mt-1 text-sm text-muted">Review this Installation here. Provisioning and account-level infrastructure are managed from Discoflare Admin.</p>

    <USkeleton v-if="managementQ.isPending.value" class="mt-8 h-48" />
    <UAlert v-else-if="managementQ.error.value" class="mt-8" color="error" title="Could not read installation details" />
    <UAlert
      v-else-if="!status?.available"
      class="mt-8"
      color="neutral"
      title="Repository deployment"
      description="This Worker has no Discoflare installation identity. Manage its Cloudflare resources from the repository and Cloudflare dashboard."
    />

    <div v-else-if="status" class="mt-8 rounded-lg border border-default bg-elevated p-5">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-sm font-medium text-highlighted">{{ status.hostname }}</p>
          <p class="mt-1 text-sm text-muted">Worker: {{ status.workerName }}</p>
        </div>
        <UBadge :label="status.primary ? 'Primary' : 'Installation'" :color="status.primary ? 'primary' : 'neutral'" variant="subtle" />
      </div>

      <div class="mt-6 grid gap-3 border-t border-default pt-5 sm:grid-cols-3">
        <div class="rounded-md border border-default p-4">
          <p class="text-sm font-medium text-highlighted">Agent Computer</p>
          <p class="mt-1 text-sm text-muted">{{ status.agentComputerEnabled ? 'Enabled' : 'Not enabled' }}</p>
        </div>
        <div class="rounded-md border border-default p-4">
          <p class="text-sm font-medium text-highlighted">Live</p>
          <p class="mt-1 text-sm text-muted">{{ status.huddlesEnabled ? 'RealtimeKit connected' : 'Not connected' }}</p>
        </div>
        <div class="rounded-md border border-default p-4">
          <p class="text-sm font-medium text-highlighted">Domain and email</p>
          <p class="mt-1 text-sm text-muted">{{ status.customDomainEnabled ? `${status.hostname} connected` : 'Using workers.dev' }}</p>
          <p v-if="status.emailDomains.length" class="mt-1 text-xs text-muted">{{ status.emailDomains.join(', ') }}</p>
        </div>
      </div>

      <div class="mt-5 flex flex-wrap items-center gap-3">
        <UButton :to="adminUrl" target="_blank" external label="Open Discoflare Admin" trailing-icon="i-ph-arrow-up-right" />
        <p class="text-xs text-muted">The Cloudflare OAuth credential is never stored in this workspace Worker.</p>
      </div>
    </div>
  </div>
</template>
