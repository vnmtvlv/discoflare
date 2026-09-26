<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { InstallationDomainSettingsDTO, InstallationManagementStatusDTO } from '~~/shared/releases'

const props = withDefaults(defineProps<{
  workspaceId: string
  /** Installation status at a glance, or the App and Email Domain forms. */
  view?: 'overview' | 'domains'
}>(), { view: 'overview' })
const { api } = useApi()
const route = useRoute()
const toast = useToast()
const queryClient = useQueryClient()
const appBusy = ref(false)
const emailBusy = ref('')

const managementQ = useQuery({
  queryKey: computed(() => ['installation-management', props.workspaceId]),
  queryFn: () => api<InstallationManagementStatusDTO>(`/api/workspaces/${props.workspaceId}/management`),
})
const domainsQ = useQuery({
  queryKey: computed(() => ['installation-domains', props.workspaceId]),
  queryFn: () => api<InstallationDomainSettingsDTO>(`/api/workspaces/${props.workspaceId}/domains`),
  // Zones come from the Control Plane; only the Domains tab needs them.
  enabled: computed(() => props.view === 'domains'),
})
const loading = computed(() => managementQ.isPending.value || (props.view === 'domains' && domainsQ.isPending.value))
const loadError = computed(() => managementQ.error.value || (props.view === 'domains' ? domainsQ.error.value : null))
function retryLoad() {
  return Promise.all([managementQ.refetch(), props.view === 'domains' ? domainsQ.refetch() : null])
}

// Disconnecting moves the workspace URL or stops mail, so both ask first.
const confirmDisconnect = ref<{ kind: 'app' } | { kind: 'email', id: string, domain: string } | null>(null)
async function runDisconnect() {
  const target = confirmDisconnect.value
  if (!target) return
  if (target.kind === 'app') await disconnectApp()
  else await disconnectEmail(target.id)
  confirmDisconnect.value = null
}

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
    const result = await api<{ hostname: string }>(`/api/workspaces/${props.workspaceId}/app-domain`, {
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
    const result = await api<{ hostname: string }>(`/api/workspaces/${props.workspaceId}/app-domain`, { method: 'DELETE' })
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
    await api(`/api/workspaces/${props.workspaceId}/email-domains`, {
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
    await api(`/api/workspaces/${props.workspaceId}/email-domains/${id}`, { method: 'DELETE' })
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
    <SettingsHeader
      :title="view === 'domains' ? 'Domains' : 'Cloudflare'"
      :description="view === 'domains'
        ? 'Where this workspace is reached, and which domains it receives email on.'
        : 'This Installation on your Cloudflare account.'"
    />

    <LayoutSkeleton v-if="loading" variant="form" :rows="3" class="mt-8" />
    <LayoutLoadError v-else-if="loadError" :message="`Cloudflare settings did not load. ${errorMessage(loadError)}`" :retry="retryLoad" />
    <UAlert
      v-else-if="!status?.available || (view === 'domains' && !domains?.managed)"
      class="mt-8"
      color="neutral"
      title="Repository deployment"
      description="This Worker has no managed Installation identity. Configure its domains from the repository and Cloudflare dashboard."
    />

    <template v-else-if="view === 'overview' && status">
      <div class="mt-8 grid gap-3 sm:grid-cols-2">
        <div class="rounded-lg border border-default p-4">
          <p class="text-xs text-muted">App Domain</p>
          <p class="mt-1 truncate font-medium text-highlighted">{{ status.hostname || 'workers.dev' }}</p>
        </div>
        <div class="rounded-lg border border-default p-4">
          <p class="text-xs text-muted">Email Domains</p>
          <p class="mt-1 truncate font-medium text-highlighted">{{ status.emailDomains.length ? status.emailDomains.join(', ') : 'None connected' }}</p>
        </div>
        <div class="rounded-lg border border-default p-4">
          <p class="text-xs text-muted">Worker</p>
          <p class="mt-1 truncate font-medium text-highlighted">{{ status.workerName }}</p>
        </div>
        <div class="rounded-lg border border-default p-4">
          <p class="text-xs text-muted">Agent Computer</p>
          <p class="mt-1 font-medium text-highlighted">{{ status.agentComputerEnabled ? 'Enabled' : 'Not enabled' }}</p>
        </div>
        <div class="rounded-lg border border-default p-4">
          <p class="text-xs text-muted">Live</p>
          <p class="mt-1 font-medium text-highlighted">{{ status.huddlesEnabled ? 'RealtimeKit connected' : 'Not connected' }}</p>
        </div>
      </div>
      <p class="mt-6 flex items-start gap-2 text-sm text-muted">
        <UIcon name="i-ph-lock-simple" class="mt-0.5 size-4 shrink-0" />
        Your Cloudflare credential stays in the Discoflare Control Plane. This workspace can only run fixed operations on its own Installation.
      </p>
    </template>

    <template v-else-if="view === 'domains' && domains">
      <section class="mt-8">
        <h2 class="text-[11px] font-bold uppercase tracking-wide text-muted">App Domain</h2>
        <p class="mt-1 text-sm text-muted">The address people open this workspace at.</p>

        <div v-if="domains.appDomain" class="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-default p-4">
          <div class="min-w-0">
            <p class="truncate font-medium text-highlighted">{{ domains.appDomain.hostname }}</p>
            <p class="mt-1 text-xs text-muted">Cloudflare zone: {{ domains.appDomain.zoneName }}</p>
          </div>
          <UButton label="Disconnect" color="neutral" variant="outline" size="sm" :loading="appBusy" @click="confirmDisconnect = { kind: 'app' }" />
        </div>

        <UForm v-else :schema="appSchema" :state="appState" class="mt-3 grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-end" @submit="connectApp">
          <UFormField name="zoneId" label="Cloudflare zone" required>
            <USelect v-model="appState.zoneId" :items="zoneOptions" value-key="value" class="w-full" />
          </UFormField>
          <UFormField name="subdomain" label="Subdomain" :description="appPreview || 'For example: chat.example.com'" required>
            <UInput v-model="appState.subdomain" placeholder="chat" class="w-full">
              <template #trailing><span v-if="zoneName(appState.zoneId)" class="text-xs text-dimmed">.{{ zoneName(appState.zoneId) }}</span></template>
            </UInput>
          </UFormField>
          <UButton type="submit" label="Connect" :loading="appBusy" />
        </UForm>
      </section>

      <section class="mt-10">
        <h2 class="text-[11px] font-bold uppercase tracking-wide text-muted">Email Domains</h2>
        <p class="mt-1 text-sm text-muted">Domains this workspace receives mail on. Create addresses for them in Email settings.</p>

        <ul v-if="domains.emailDomains.length" class="mt-3 divide-y divide-default rounded-lg border border-default">
          <li v-for="domain in domains.emailDomains" :key="domain.id" class="flex flex-wrap items-center justify-between gap-4 px-4 py-3">
            <div class="min-w-0">
              <p class="truncate font-medium text-highlighted">{{ domain.domain }}</p>
              <p class="mt-1 text-xs text-muted">Cloudflare zone: {{ domain.zoneName }}</p>
            </div>
            <UButton
              label="Disconnect"
              color="neutral"
              variant="outline"
              size="sm"
              :loading="emailBusy === domain.id"
              @click="confirmDisconnect = { kind: 'email', id: domain.id, domain: domain.domain }"
            />
          </li>
        </ul>

        <UForm :schema="emailSchema" :state="emailState" class="mt-3 grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-end" @submit="connectEmail">
          <UFormField name="zoneId" label="Cloudflare zone" required>
            <USelect v-model="emailState.zoneId" :items="zoneOptions" value-key="value" class="w-full" />
          </UFormField>
          <UFormField name="subdomain" label="Subdomain" hint="Optional" :description="emailPreview ? `Will connect ${emailPreview}` : 'Leave blank to use the zone apex'">
            <UInput v-model="emailState.subdomain" placeholder="mail" class="w-full">
              <template #trailing><span v-if="zoneName(emailState.zoneId)" class="text-xs text-dimmed">.{{ zoneName(emailState.zoneId) }}</span></template>
            </UInput>
          </UFormField>
          <UButton type="submit" label="Add domain" :loading="emailBusy === 'connect'" />
        </UForm>
      </section>
    </template>

    <UModal
      :open="Boolean(confirmDisconnect)"
      :title="confirmDisconnect?.kind === 'app' ? 'Disconnect the App Domain?' : `Disconnect ${confirmDisconnect?.kind === 'email' ? confirmDisconnect.domain : ''}?`"
      @update:open="(value: boolean) => { if (!value) confirmDisconnect = null }"
    >
      <template #body>
        <p class="text-sm text-muted">
          {{ confirmDisconnect?.kind === 'app'
            ? 'The workspace moves back to its workers.dev address and this page reloads there. Links to the current domain stop working.'
            : 'This workspace stops sending and receiving mail on it. Delete its mailboxes in Email settings first.' }}
        </p>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" label="Cancel" @click="confirmDisconnect = null" />
        <UButton color="error" label="Disconnect" :loading="appBusy || Boolean(emailBusy)" @click="runDisconnect" />
      </template>
    </UModal>
  </div>
</template>
