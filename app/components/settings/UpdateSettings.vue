<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import type { UpdateStatusDTO } from '~~/shared/releases'
import { formatDateTime } from '~~/shared/format'

const props = defineProps<{ workspaceId: string }>()

const updateQ = useQuery({
  queryKey: computed(() => ['updates', props.workspaceId]),
  queryFn: () => $fetch<UpdateStatusDTO>(`/api/workspaces/${props.workspaceId}/updates`),
  staleTime: 6 * 60 * 60 * 1000,
})

const status = computed(() => updateQ.data.value)
const releaseLabel = computed(() => status.value?.releasesBehind === 1 ? 'release' : 'releases')
const updating = ref(false)
const updateError = ref('')
const updateComplete = ref(false)

async function installManagedUpdate() {
  const targetVersion = status.value?.latestRelease?.tagName
  if (!targetVersion) return
  updating.value = true
  updateError.value = ''
  updateComplete.value = false
  try {
    await $fetch(`/api/workspaces/${props.workspaceId}/updates`, {
      method: 'POST',
      body: { targetVersion },
    })
    updateComplete.value = true
    await updateQ.refetch()
  }
  catch (cause) {
    const error = cause as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    updateError.value = error.data?.statusMessage || error.statusMessage || error.message || 'Managed update failed.'
  }
  finally {
    updating.value = false
  }
}
</script>

<template>
  <div>
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold text-highlighted">Updates</h1>
        <p class="mt-1 text-sm text-muted">Install stable Discoflare releases published on GitHub.</p>
      </div>
      <UButton
        icon="i-ph-arrows-clockwise"
        color="neutral"
        variant="ghost"
        square
        aria-label="Check for updates"
        :loading="updateQ.isFetching.value"
        @click="updateQ.refetch()"
      />
    </div>

    <USkeleton v-if="updateQ.isPending.value" class="mt-8 h-44" />
    <UAlert
      v-else-if="updateQ.error.value"
      class="mt-8"
      color="error"
      title="Could not check for updates"
      description="Your workspace is still available. Try again later."
    />
    <template v-else-if="status">
      <UAlert
        v-if="status.checkFailed"
        class="mt-8"
        color="warning"
        title="Could not check GitHub Releases"
        :description="`Installed version: ${status.installedVersion}. Your workspace is still available.`"
      />

      <div v-else class="mt-8 rounded-lg border border-default bg-elevated p-5">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="text-sm font-medium text-highlighted">Discoflare {{ status.installedVersion }}</p>
            <p v-if="status.updateAvailable" class="mt-1 text-sm text-warning">
              {{ status.releasesBehind }} {{ releaseLabel }} behind
            </p>
            <p v-else class="mt-1 text-sm text-success">Up to date</p>
          </div>
          <UBadge
            :label="status.managementMode === 'managed' ? 'Managed installation' : 'Manual management'"
            color="neutral"
            variant="subtle"
          />
        </div>

        <div v-if="status.latestRelease" class="mt-6 border-t border-default pt-5">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <p class="text-sm font-medium text-highlighted">{{ status.latestRelease.name }}</p>
            <p class="text-xs text-muted">{{ formatDateTime(status.latestRelease.publishedAt) }}</p>
          </div>
          <p
            v-if="status.updateAvailable && status.latestRelease.notes"
            class="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-muted"
          >{{ status.latestRelease.notes }}</p>
        </div>

        <div class="mt-6 flex flex-wrap gap-2">
          <UButton
            v-if="status.managementMode === 'managed' && status.updateAvailable"
            :label="`Install ${status.latestRelease?.tagName.replace(/^v/, '')}`"
            :loading="updating"
            icon="i-ph-download-simple"
            @click="installManagedUpdate"
          />
          <UButton
            v-if="status.upgradeUrl"
            :to="status.upgradeUrl"
            external
            target="_blank"
            :label="`Upgrade to ${status.latestRelease?.tagName.replace(/^v/, '')}`"
            trailing-icon="i-ph-arrow-up-right"
          />
          <UButton
            v-if="status.latestRelease"
            :to="status.latestRelease.url"
            external
            target="_blank"
            label="View release"
            trailing-icon="i-ph-arrow-up-right"
            color="neutral"
            variant="outline"
          />
        </div>
      </div>

      <UAlert
        v-if="updateComplete"
        class="mt-4"
        color="success"
        title="Discoflare was updated"
        description="Reload the workspace to use the new release."
      />
      <UAlert v-if="updateError" class="mt-4" color="error" title="Update failed" :description="updateError" />

      <UAlert
        v-if="status.updateAvailable && status.managementMode === 'manual' && status.installationKind === 'manual'"
        class="mt-4"
        color="neutral"
        title="Manual deployment"
        description="Update the connected repository and apply its D1 migrations before deploying the new Worker."
      />
    </template>
  </div>
</template>
