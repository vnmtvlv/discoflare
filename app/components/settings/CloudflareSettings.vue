<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { InstallationDomainSettingsDTO, InstallationManagementStatusDTO } from '~~/shared/releases'

const props = defineProps<{ workspaceId: string }>()
const route = useRoute()
const toast = useToast()
const queryClient = useQueryClient()
const appBusy = ref(false)
const emailBusy = ref('')

const managementQ = useQuery({
  queryKey: computed(() => ['installation-management', props.workspaceId]),
  queryFn: () => $fetch<InstallationManagementStatusDTO>(`/api/workspaces/${props.workspaceId}/management`),
})
const domainsQ = useQuery({
  queryKey: computed(() => ['installation-domains', props.workspaceId]),
  queryFn: () => $fetch<InstallationDomainSettingsDTO>(`/api/workspaces/${props.workspaceId}/domains`),
})

const status = computed(() => managementQ.data.value)
const domains = computed(() => domainsQ.data.value)
const activeZones = computed(() => (domains.value?.zones ?? []).filter(zone => zone.status === 'active'))
const zoneOptions = computed(() => activeZones.value.map(zone => ({ label: zone.name, value: zone.id })))

const appSchema = z.object({
  zoneId: z.string().min(1, 'Choose a Cloudflare zone'),
  subdomain: z.string().trim().min(1, 'Enter a subdomain').max(63).regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/iu, 'Use one DNS label, such as inchi'),
})
type AppSchema = z.output<typeof appSchema>
const appState = reactive<Partial<AppSchema>>({ zoneId: '', subdomain: '' })

const emailSchema = z.object({
  zoneId: z.string().min(1, 'Choose a Cloudflare zone'),
  subdomain: z.string().trim().max(63).refine(value => !value || /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/iu.test(value), 'Use one DNS label, such as mail'),
})
type EmailSchema = z.output<typeof emailSchema>
const emailState = reactive<Partial<EmailSchema>>({ zoneId: '', subdomain: '' })

watch(activeZones, (zones) => {
  const fallback = zones[0]?.id || ''
  if (!zones.some(zone => zone.id === appState.zoneId)) appState.zoneId = fallback
  if (!zones.some(zone => zone.id === emailState.zoneId)) emailState.zoneId = fallback
}, { immediate: true })

function zoneName(zoneId: string | undefined) {
  return activeZones.value.find(zone => zone.id === zoneId)?.name || ''
}

function fullHostname(zoneId: string | undefined, subdomain: string | undefined, apex = false) {
  const zone = zoneName(zoneId)
  const label = subdomain?.trim().toLowerCase() || ''
  if (!zone) return ''
  if (!label && apex) return zone
  return label ? `${label}.${zone}` : ''
}

const appPreview = computed(() => fullHostname(appState.zoneId, appState.subdomain))
const emailPreview = computed(() => fullHostname(emailState.zoneId, emailState.subdomain, true))

async function refreshDomains() {
  await Promise.all([
    domainsQ.refetch(),
    managementQ.refetch(),
    queryClient.invalidateQueries({ queryKey: ['mail-settings', props.workspaceId] }),
  ])
}

async function connectApp(event: FormSubmitEvent<AppSchema>) {
  appBusy.value = true
  try {
    const result = await $fetch<{ hostname: string }>(`/api/workspaces/${props.workspaceId}/app-domain`, {
      method: 'PUT',
      body: { zoneId: event.data.zoneId, hostname: event.data.subdomain },
    })
    toast.add({ title: `${result.hostname} connected`, color: 'success' })
    await navigateTo(`https://${result.hostname}${route.fullPath}`, { external: true })
  }
  catch (error) {
    toast.add({ title: errorMessage(error), color: 'error' })
  }
  finally {
    appBusy.value = false
  }
}

async function disconnectApp() {
  appBusy.value = true
  try {
    const result = await $fetch<{ hostname: string }>(`/api/workspaces/${props.workspaceId}/app-domain`, { method: 'DELETE' })
    toast.add({ title: 'App Domain disconnected', color: 'success' })
    await navigateTo(`https://${result.hostname}${route.fullPath}`, { external: true })
  }
  catch (error) {
    toast.add({ title: errorMessage(error), color: 'error' })
  }
  finally {
    appBusy.value = false
  }
}

async function connectEmail(event: FormSubmitEvent<EmailSchema>) {
  emailBusy.value = 'connect'
  try {
    const domain = fullHostname(event.data.zoneId, event.data.subdomain, true)
    await $fetch(`/api/workspaces/${props.workspaceId}/email-domains`, {
      method: 'POST',
      body: { zoneId: event.data.zoneId, domain },
    })
    emailState.subdomain = ''
    await refreshDomains()
    toast.add({ title: `${domain} connected`, color: 'success' })
  }
  catch (error) {
    toast.add({ title: errorMessage(error), color: 'error' })
  }
  finally {
    emailBusy.value = ''
  }
}

async function disconnectEmail(id: string) {
  emailBusy.value = id
  try {
    await $fetch(`/api/workspaces/${props.workspaceId}/email-domains/${id}`, { method: 'DELETE' })
    await refreshDomains()
    toast.add({ title: 'Email Domain disconnected', color: 'success' })
  }
  catch (error) {
    toast.add({ title: errorMessage(error), color: 'error' })
  }
  finally {
    emailBusy.value = ''
  }
}
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold text-highlighted">Cloudflare</h1>
    <p class="mt-1 text-sm text-muted">Connect this workspace's App Domain and Email Domains after the base Installation is ready.</p>

    <USkeleton v-if="managementQ.isPending.value || domainsQ.isPending.value" class="mt-8 h-64" />
    <UAlert v-else-if="managementQ.error.value || domainsQ.error.value" class="mt-8" color="error" title="Could not read Cloudflare settings" :description="errorMessage(managementQ.error.value || domainsQ.error.value)" />
    <UAlert
      v-else-if="!status?.available || !domains?.managed"
      class="mt-8"
      color="neutral"
      title="Repository deployment"
      description="This Worker has no managed Installation identity. Configure its domains from the repository and Cloudflare dashboard."
    />

    <template v-else-if="status && domains">
      <UAlert
        class="mt-8"
        color="info"
        variant="subtle"
        title="Your Cloudflare credential stays in Discoflare Control Plane"
        description="This workspace can invoke only fixed operations for its own Installation. It never receives the OAuth credential."
      />

      <section class="mt-8 border-t border-default pt-8">
        <h2 class="font-semibold text-highlighted">App Domain</h2>
        <p class="mt-1 text-sm text-muted">The canonical URL for this workspace. It is independent from every Email Domain.</p>

        <div v-if="domains.appDomain" class="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-default p-4">
          <div>
            <p class="font-medium text-highlighted">{{ domains.appDomain.hostname }}</p>
            <p class="mt-1 text-xs text-muted">Cloudflare zone: {{ domains.appDomain.zoneName }}</p>
          </div>
          <UButton label="Disconnect" color="error" variant="soft" :loading="appBusy" @click="disconnectApp" />
        </div>

        <UForm v-else :schema="appSchema" :state="appState" class="mt-4 grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-end" @submit="connectApp">
          <UFormField name="zoneId" label="Cloudflare zone" required>
            <USelect v-model="appState.zoneId" :items="zoneOptions" value-key="value" class="w-full" />
          </UFormField>
          <UFormField name="subdomain" label="Subdomain" :description="appPreview || 'For example: inchi.discoflare.com'" required>
            <UInput v-model="appState.subdomain" placeholder="inchi" class="w-full">
              <template #trailing><span v-if="zoneName(appState.zoneId)" class="text-xs text-dimmed">.{{ zoneName(appState.zoneId) }}</span></template>
            </UInput>
          </UFormField>
          <UButton type="submit" label="Connect" :loading="appBusy" />
        </UForm>
      </section>

      <section class="mt-8 border-t border-default pt-8">
        <h2 class="font-semibold text-highlighted">Email Domains</h2>
        <p class="mt-1 text-sm text-muted">Connect one or more domains here, then create addresses in Email settings.</p>

        <div v-if="domains.emailDomains.length" class="mt-4 divide-y divide-default rounded-lg border border-default">
          <div v-for="domain in domains.emailDomains" :key="domain.id" class="flex flex-wrap items-center justify-between gap-4 p-4">
            <div>
              <p class="font-medium text-highlighted">{{ domain.domain }}</p>
              <p class="mt-1 text-xs text-muted">Cloudflare zone: {{ domain.zoneName }}</p>
            </div>
            <UButton label="Disconnect" color="error" variant="soft" :loading="emailBusy === domain.id" @click="disconnectEmail(domain.id)" />
          </div>
        </div>

        <UForm :schema="emailSchema" :state="emailState" class="mt-4 grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-end" @submit="connectEmail">
          <UFormField name="zoneId" label="Cloudflare zone" required>
            <USelect v-model="emailState.zoneId" :items="zoneOptions" value-key="value" class="w-full" />
          </UFormField>
          <UFormField name="subdomain" label="Subdomain" hint="Optional" :description="emailPreview ? `Will connect ${emailPreview}` : 'Leave blank to use the zone apex'">
            <UInput v-model="emailState.subdomain" placeholder="mail" class="w-full">
              <template #trailing><span v-if="zoneName(emailState.zoneId)" class="text-xs text-dimmed">.{{ zoneName(emailState.zoneId) }}</span></template>
            </UInput>
          </UFormField>
          <UButton type="submit" label="Connect" :loading="emailBusy === 'connect'" />
        </UForm>
      </section>

      <section class="mt-8 grid gap-3 border-t border-default pt-8 sm:grid-cols-3">
        <div class="rounded-md border border-default p-4">
          <p class="text-sm font-medium text-highlighted">Worker</p>
          <p class="mt-1 text-sm text-muted">{{ status.workerName }}</p>
        </div>
        <div class="rounded-md border border-default p-4">
          <p class="text-sm font-medium text-highlighted">Agent Computer</p>
          <p class="mt-1 text-sm text-muted">{{ status.agentComputerEnabled ? 'Enabled' : 'Not enabled' }}</p>
        </div>
        <div class="rounded-md border border-default p-4">
          <p class="text-sm font-medium text-highlighted">Live</p>
          <p class="mt-1 text-sm text-muted">{{ status.huddlesEnabled ? 'RealtimeKit connected' : 'Not connected' }}</p>
        </div>
      </section>
    </template>
  </div>
</template>
