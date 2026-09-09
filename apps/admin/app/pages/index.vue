<script setup lang="ts">
import type { DeployRequest, DeployResponse } from '@discoflare/installer-core'
import type { AdminSession, InstallationList } from '../../shared/types'
import { waitForConnectedSession } from '../utils/session-activation'

const { data: session, error: sessionFailure, refresh: refreshSession } = await useFetch<AdminSession>('/api/session')
const inventory = ref<InstallationList | null>(null)
const loadingInventory = ref(false)
const connecting = ref(false)
const mutating = ref<string | null>(null)
const token = ref('')
const error = ref('')
const showCreate = ref(false)

const form = reactive<DeployRequest>({
  accountId: '',
  workerName: 'discoflare',
  managementMode: 'admin',
  adminEmail: session.value?.email || '',
  allowedEmails: [],
  appName: 'Discoflare',
  authMode: 'builtin',
  registrationMode: 'invite_only',
  customDomainEnabled: false,
  zoneId: '',
  zoneName: '',
  appSubdomain: 'discoflare',
  mailEnabled: false,
  mailSubdomain: 'discoflare',
  mailLocalPart: 'inbox',
  realtimekitEnabled: true,
  realtimekitApiToken: '',
})

const activeZones = computed(() => inventory.value?.zones.filter(zone => zone.status === 'active') || [])
const latestVersion = computed(() => inventory.value?.latestVersion || session.value?.latestVersion || null)
const updateCount = computed(() => latestVersion.value
  ? inventory.value?.installations.filter(item => item.version !== latestVersion.value).length || 0
  : 0)

watch(() => form.workerName, (value, previous) => {
  if (!form.appSubdomain || form.appSubdomain === previous) form.appSubdomain = value
})

watch(() => form.zoneId, (zoneId) => {
  form.zoneName = activeZones.value.find(zone => zone.id === zoneId)?.name || ''
})

function errorMessage(cause: unknown) {
  if (cause && typeof cause === 'object') {
    const value = cause as { data?: { message?: string }, message?: string }
    return value.data?.message || value.message || 'Operation failed'
  }
  return 'Operation failed'
}

const sessionError = computed(() => sessionFailure.value ? errorMessage(sessionFailure.value) : '')

async function loadInventory() {
  if (!session.value?.tokenConnected) return
  loadingInventory.value = true
  error.value = ''
  try {
    inventory.value = await $fetch<InstallationList>('/api/installations')
    if (!form.zoneId) form.zoneId = activeZones.value[0]?.id || ''
  }
  catch (cause) {
    error.value = errorMessage(cause)
  }
  finally {
    loadingInventory.value = false
  }
}

async function connectToken() {
  connecting.value = true
  error.value = ''
  try {
    await $fetch('/api/token', { method: 'POST', body: { token: token.value } })
    token.value = ''
    await waitForConnectedSession({
      refresh: refreshSession,
      isConnected: () => Boolean(session.value?.tokenConnected),
    })
    await loadInventory()
  }
  catch (cause) {
    error.value = errorMessage(cause)
  }
  finally {
    connecting.value = false
  }
}

async function createInstallation() {
  mutating.value = 'create'
  error.value = ''
  try {
    const response = await $fetch<DeployResponse>('/api/installations', { method: 'POST', body: form })
    showCreate.value = false
    await loadInventory()
    await navigateTo(response.setupUrl || response.url, { external: true, open: { target: '_blank' } })
  }
  catch (cause) {
    error.value = errorMessage(cause)
  }
  finally {
    mutating.value = null
  }
}

async function updateInstallation(workerName: string) {
  mutating.value = workerName
  error.value = ''
  try {
    await $fetch(`/api/installations/${encodeURIComponent(workerName)}`, {
      method: 'POST',
      body: { targetVersion: latestVersion.value ? `v${latestVersion.value}` : undefined },
    })
    await loadInventory()
  }
  catch (cause) {
    error.value = errorMessage(cause)
  }
  finally {
    mutating.value = null
  }
}

onMounted(loadInventory)

useSeoMeta({
  title: 'Discoflare Admin',
  description: 'Manage Discoflare installations in this Cloudflare account.',
})
</script>

<template>
  <div class="relative min-h-screen overflow-hidden">
    <div class="noise-grid pointer-events-none absolute inset-x-0 top-0 h-[38rem]" />

    <header class="relative border-b border-muted bg-default/80 backdrop-blur">
      <UContainer class="flex h-20 items-center justify-between gap-4">
        <AdminBrand />
        <div v-if="session" class="text-right">
          <p class="text-sm font-medium text-highlighted">{{ session.accountName }}</p>
          <p class="text-xs text-muted">{{ session.email }}</p>
        </div>
      </UContainer>
    </header>

    <main class="relative py-10 sm:py-14">
      <UContainer class="max-w-5xl">
        <div class="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p class="text-sm font-medium text-primary">Account control plane</p>
            <h1 class="mt-2 text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">Your Discoflare installations</h1>
            <p class="mt-3 max-w-2xl text-muted">One Cloudflare credential stays in this small Worker. Workspace Workers never receive it.</p>
          </div>
          <UButton v-if="session?.tokenConnected" label="New installation" leading-icon="i-ph-plus" size="lg" @click="showCreate = !showCreate" />
        </div>

        <UAlert v-if="sessionError || error" class="mt-6" color="error" variant="subtle" title="Operation stopped" :description="sessionError || error" />

        <UCard v-if="session && !session.tokenConnected" class="mt-8" :ui="{ body: 'p-6 sm:p-8' }">
          <div class="grid gap-8 lg:grid-cols-[1fr_0.9fr]">
            <div>
              <div class="flex size-11 items-center justify-center rounded-xl bg-primary/15">
                <UIcon name="i-ph-key" class="size-6 text-primary" />
              </div>
              <h2 class="mt-5 text-xl font-semibold text-highlighted">Connect this Cloudflare account</h2>
              <p class="mt-2 text-sm leading-6 text-muted">Create one Account Admin Token in Cloudflare, then paste it here. It goes directly to this Worker and never through discoflare.com.</p>
              <UAlert class="mt-5" color="warning" variant="subtle" icon="i-ph-warning" title="Account-wide authority" description="Use a dedicated Cloudflare account for the strongest isolation. This Worker can exercise every permission granted to the token." />
            </div>
            <form class="space-y-4 rounded-xl border border-default bg-elevated p-5" @submit.prevent="connectToken">
              <UButton :to="session.tokenTemplateUrl" target="_blank" external block color="neutral" variant="outline" label="Create Account Admin Token" trailing-icon="i-ph-arrow-up-right" />
              <UFormField label="Account Admin Token" required hint="Stored only as this Worker's encrypted secret.">
                <UInput v-model="token" type="password" autocomplete="off" class="w-full" />
              </UFormField>
              <UButton type="submit" block label="Connect account" :loading="connecting" :disabled="!token.trim()" />
            </form>
          </div>
        </UCard>

        <template v-else-if="session?.tokenConnected">
          <UAlert
            v-if="updateCount"
            class="mt-8"
            color="primary"
            variant="subtle"
            icon="i-ph-arrow-circle-up"
            :title="`${updateCount} ${updateCount === 1 ? 'installation has' : 'installations have'} an update`"
            :description="latestVersion ? `Discoflare ${latestVersion} is available.` : undefined"
          />

          <UCard v-if="showCreate" class="mt-8" :ui="{ body: 'p-6 sm:p-8' }">
            <div class="flex items-start justify-between gap-4">
              <div><h2 class="text-lg font-semibold text-highlighted">New installation</h2><p class="mt-1 text-sm text-muted">Live is enabled automatically. The first domain-backed installation also receives workspace email.</p></div>
              <UButton icon="i-ph-x" aria-label="Close" color="neutral" variant="ghost" @click="showCreate = false" />
            </div>
            <form class="mt-6 grid gap-5 sm:grid-cols-2" @submit.prevent="createInstallation">
              <UFormField label="Worker name" required><UInput v-model="form.workerName" class="w-full" /></UFormField>
              <UFormField label="Workspace name" required><UInput v-model="form.appName" class="w-full" /></UFormField>
              <UFormField label="Owner email" required><UInput v-model="form.adminEmail" type="email" class="w-full" /></UFormField>
              <UFormField label="Registration" required><USelect v-model="form.registrationMode" :items="[{ label: 'Invite only', value: 'invite_only' }, { label: 'Open signup', value: 'open' }]" value-key="value" class="w-full" /></UFormField>
              <div class="sm:col-span-2"><USwitch v-model="form.customDomainEnabled" label="Custom domain" description="Otherwise this installation uses workers.dev." /></div>
              <template v-if="form.customDomainEnabled">
                <UFormField label="Cloudflare domain" required><USelect v-model="form.zoneId" :items="activeZones.map(zone => ({ label: zone.name, value: zone.id }))" value-key="value" class="w-full" /></UFormField>
                <UFormField label="Subdomain" required><UInput v-model="form.appSubdomain" class="w-full"><template #trailing><span v-if="form.zoneName" class="text-xs text-muted">.{{ form.zoneName }}</span></template></UInput></UFormField>
              </template>
              <div class="flex justify-end gap-3 border-t border-muted pt-5 sm:col-span-2">
                <UButton type="button" color="neutral" variant="ghost" label="Cancel" @click="showCreate = false" />
                <UButton type="submit" label="Deploy Discoflare" trailing-icon="i-ph-arrow-right" :loading="mutating === 'create'" />
              </div>
            </form>
          </UCard>

          <div v-if="loadingInventory" class="mt-10 flex items-center justify-center gap-3 py-16 text-muted"><UIcon name="i-ph-spinner-gap" class="size-5 animate-spin" />Discovering installations</div>
          <div v-else class="mt-8 grid gap-4">
            <UCard v-for="installation in inventory?.installations" :key="installation.workerName">
              <div class="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <h2 class="font-semibold text-highlighted">{{ installation.configuration.appName }}</h2>
                    <UBadge v-if="installation.resources.primary" label="Primary" color="neutral" variant="subtle" />
                    <UBadge :label="installation.configuration.managementMode === 'admin' ? 'Managed by Admin' : 'Not connected to Admin'" :color="installation.configuration.managementMode === 'admin' ? 'success' : 'warning'" variant="subtle" />
                  </div>
                  <a :href="installation.origin" target="_blank" class="mt-1 block truncate text-sm text-primary hover:underline">{{ installation.origin.replace(/^https:\/\//, '') }}</a>
                  <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    <span>Discoflare {{ installation.version || 'legacy' }}</span>
                    <span>{{ installation.configuration.realtimekitEnabled ? 'Live enabled' : 'Live off' }}</span>
                    <span>{{ installation.configuration.mailEnabled ? installation.resources.mailDomain : 'No email' }}</span>
                  </div>
                </div>
                <UButton
                  :label="installation.configuration.managementMode !== 'admin' ? 'Connect and update' : installation.version === latestVersion ? 'Repair' : `Update to ${latestVersion}`"
                  :color="installation.version === latestVersion && installation.configuration.managementMode === 'admin' ? 'neutral' : 'primary'"
                  :variant="installation.version === latestVersion && installation.configuration.managementMode === 'admin' ? 'outline' : 'solid'"
                  :loading="mutating === installation.workerName"
                  @click="updateInstallation(installation.workerName)"
                />
              </div>
            </UCard>
            <UCard v-if="inventory && !inventory.installations.length"><div class="py-10 text-center"><UIcon name="i-ph-cloud" class="mx-auto size-8 text-muted" /><p class="mt-3 font-medium text-highlighted">No Discoflare installations yet</p><p class="mt-1 text-sm text-muted">Create the first workspace in this account.</p></div></UCard>
          </div>
        </template>
      </UContainer>
    </main>
  </div>
</template>
