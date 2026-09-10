<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import type { InstallationManagementStatusDTO } from '~~/shared/releases'
import { readDeployStream } from '../../utils/deploy-stream'

const props = defineProps<{ workspaceId: string }>()

const managementQ = useQuery({
  queryKey: computed(() => ['installation-management', props.workspaceId]),
  queryFn: () => $fetch<InstallationManagementStatusDTO>(`/api/workspaces/${props.workspaceId}/management`),
})

const status = computed(() => managementQ.data.value)
const enabling = ref<'agent-computer' | 'huddles' | 'domain' | null>(null)
const error = ref('')
const showDomain = ref(false)
const loadingZones = ref(false)
const zones = ref<Array<{ id: string, name: string }>>([])
const domain = reactive({ zoneId: '', subdomain: '', emailEnabled: true })
const bootstrapUrl = computed(() => {
  const url = new URL('/deploy', 'https://discoflare.com')
  if (status.value?.hostname) url.searchParams.set('workspace', `https://${status.value.hostname}`)
  return url.toString()
})

async function enableCapability(capability: 'agent-computer' | 'huddles' | 'domain') {
  enabling.value = capability
  error.value = ''
  try {
    const response = await fetch(`/api/workspaces/${props.workspaceId}/management/capabilities`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/x-ndjson', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        capability,
        ...(capability === 'domain'
          ? {
              zoneId: domain.zoneId,
              zoneName: zones.value.find(zone => zone.id === domain.zoneId)?.name || '',
              appSubdomain: domain.subdomain,
              emailEnabled: domain.emailEnabled,
            }
          : {}),
      }),
    })
    const deployed = await readDeployStream(response)
    if (capability === 'domain') {
      window.location.replace(deployed.url)
      return
    }
    await managementQ.refetch()
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Capability could not be enabled.'
  }
  finally {
    enabling.value = null
  }
}

async function configureDomain() {
  showDomain.value = !showDomain.value
  if (!showDomain.value || zones.value.length) return
  loadingZones.value = true
  error.value = ''
  try {
    const result = await $fetch<{ zones: Array<{ id: string, name: string }> }>(`/api/workspaces/${props.workspaceId}/management/zones`)
    zones.value = result.zones
    domain.zoneId = result.zones[0]?.id || ''
    domain.subdomain ||= status.value?.workerName || 'discoflare'
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Cloudflare domains could not be loaded.'
  }
  finally {
    loadingZones.value = false
  }
}
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

        <div class="mt-6 grid gap-3 border-t border-default pt-5 sm:grid-cols-3">
          <div class="rounded-md border border-default p-4">
            <p class="text-sm font-medium text-highlighted">Agent Computer</p>
            <p class="mt-1 text-sm text-muted">{{ status.agentComputerEnabled ? 'Linux sandbox and task workflows are enabled.' : 'Optional Linux connection. Requires the Workers Paid plan. Chat agents work without it.' }}</p>
            <UButton
              v-if="!status.agentComputerEnabled && status.managementMode === 'admin'"
              class="mt-3"
              label="Enable"
              size="sm"
              color="neutral"
              variant="outline"
              :loading="enabling === 'agent-computer'"
              :disabled="Boolean(enabling)"
              @click="enableCapability('agent-computer')"
            />
          </div>
          <div class="rounded-md border border-default p-4">
            <p class="text-sm font-medium text-highlighted">Huddles</p>
            <p class="mt-1 text-sm text-muted">{{ status.huddlesEnabled ? 'RealtimeKit is connected.' : 'Discoflare Admin can connect RealtimeKit.' }}</p>
            <UButton
              v-if="!status.huddlesEnabled && status.managementMode === 'admin'"
              class="mt-3"
              label="Enable"
              size="sm"
              color="neutral"
              variant="outline"
              :loading="enabling === 'huddles'"
              :disabled="Boolean(enabling)"
              @click="enableCapability('huddles')"
            />
          </div>
          <div class="rounded-md border border-default p-4">
            <p class="text-sm font-medium text-highlighted">Domain and email</p>
            <p class="mt-1 text-sm text-muted">
              {{ status.customDomainEnabled ? `${status.hostname} is connected.` : 'Optional. The workspace stays on workers.dev until connected.' }}
            </p>
            <UButton
              v-if="!status.customDomainEnabled && status.managementMode === 'admin'"
              class="mt-3"
              label="Configure"
              size="sm"
              color="neutral"
              variant="outline"
              :loading="loadingZones"
              :disabled="Boolean(enabling)"
              @click="configureDomain"
            />
          </div>
        </div>

        <form v-if="showDomain && !status.customDomainEnabled" class="mt-4 grid gap-4 rounded-md border border-default p-4 sm:grid-cols-2" @submit.prevent="enableCapability('domain')">
          <UFormField label="Cloudflare domain" required>
            <USelect v-model="domain.zoneId" :items="zones.map(zone => ({ label: zone.name, value: zone.id }))" value-key="value" class="w-full" :loading="loadingZones" />
          </UFormField>
          <UFormField label="Subdomain" required>
            <UInput v-model="domain.subdomain" class="w-full" />
          </UFormField>
          <USwitch v-if="status.emailEligible" v-model="domain.emailEnabled" label="Connect workspace email" description="Uses the same subdomain and the zone catch-all route." />
          <div class="flex items-end justify-end gap-2 sm:col-start-2">
            <UButton type="button" label="Cancel" color="neutral" variant="ghost" @click="showDomain = false" />
            <UButton type="submit" label="Connect" :loading="enabling === 'domain'" :disabled="!domain.zoneId || !domain.subdomain || Boolean(enabling && enabling !== 'domain')" />
          </div>
        </form>

        <UAlert v-if="error" class="mt-4" color="error" variant="subtle" title="Could not enable capability" :description="error" />

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
