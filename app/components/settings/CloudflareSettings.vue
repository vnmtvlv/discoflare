<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import type { InstallationManagementStatusDTO } from '~~/shared/releases'

const props = defineProps<{ workspaceId: string }>()

const managementQ = useQuery({
  queryKey: computed(() => ['installation-management', props.workspaceId]),
  queryFn: () => $fetch<InstallationManagementStatusDTO>(`/api/workspaces/${props.workspaceId}/management`),
})

const status = computed(() => managementQ.data.value)
const bootstrapUrl = computed(() => {
  const url = new URL('/deploy', 'https://discoflare.com')
  if (status.value?.hostname) url.searchParams.set('workspace', `https://${status.value.hostname}`)
  return url.toString()
})
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold text-highlighted">Cloudflare</h1>
    <p class="mt-1 text-sm text-muted">Infrastructure for this installation is operated from Discoflare Admin.</p>

    <USkeleton v-if="managementQ.isPending.value" class="mt-8 h-48" />
    <UAlert
      v-else-if="managementQ.error.value"
      class="mt-8"
      color="error"
      title="Could not read installation management"
    />
    <UAlert
      v-else-if="!status?.available"
      class="mt-8"
      color="neutral"
      title="Repository deployment"
      description="This Worker has no guided-installation identity. Manage its Cloudflare resources from the repository and Cloudflare dashboard."
    />

    <template v-else-if="status">
      <div class="mt-8 rounded-lg border border-default bg-elevated p-5">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="text-sm font-medium text-highlighted">{{ status.hostname }}</p>
            <p class="mt-1 text-sm text-muted">Worker: {{ status.workerName }}</p>
          </div>
          <UBadge
            :label="status.managementMode === 'admin' ? 'Admin managed' : 'Needs adoption'"
            :color="status.managementMode === 'admin' ? 'success' : 'warning'"
            variant="subtle"
          />
        </div>

        <div class="mt-6 grid gap-3 border-t border-default pt-5 sm:grid-cols-2">
          <div class="rounded-md border border-default p-4">
            <p class="text-sm font-medium text-highlighted">Huddles</p>
            <p class="mt-1 text-sm text-muted">{{ status.huddlesEnabled ? 'RealtimeKit is connected.' : 'Discoflare Admin can connect RealtimeKit.' }}</p>
          </div>
          <div class="rounded-md border border-default p-4">
            <p class="text-sm font-medium text-highlighted">Email</p>
            <p class="mt-1 text-sm text-muted">
              {{ status.emailEnabled ? `${status.emailDomain} is connected.` : 'Available to the primary domain-backed installation.' }}
            </p>
          </div>
        </div>

        <div class="mt-5 flex flex-wrap items-center gap-3">
          <UButton
            :to="status.adminOrigin || bootstrapUrl"
            target="_blank"
            external
            :label="status.adminOrigin ? 'Open Discoflare Admin' : 'Set up Discoflare Admin'"
            trailing-icon="i-ph-arrow-up-right"
          />
          <p class="text-xs text-muted">The Account Admin Token is never stored in this workspace Worker.</p>
        </div>
      </div>

      <UAlert
        v-if="status.managementMode === 'managed'"
        class="mt-4"
        color="warning"
        title="Legacy per-workspace credential"
        description="Set up Discoflare Admin and adopt this installation to remove the broad Cloudflare token from this Worker."
      />
    </template>
  </div>
</template>
