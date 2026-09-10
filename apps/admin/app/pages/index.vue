<script setup lang="ts">
import type { DeployRequest } from '@discoflare/installer-core'
import type { AdminSession, InstallationList } from '../../shared/types'
import { isNewerRelease } from '~~/shared/versions'
import { ADMIN_LOGOUT_PATH, GITHUB_RELEASES_URL } from '../utils/account-controls'
import { readDeployStream } from '../utils/deploy-stream'
import { waitForAdminVersion, waitForConnectedSession, waitForDisconnectedSession } from '../utils/session-activation'
import { verifyWorkspaceDeployment } from '../utils/deployment-health'

const { data: session, error: sessionFailure } = await useFetch<AdminSession>('/api/session')
if (sessionFailure.value?.statusCode === 401) await navigateTo('/login', { redirectCode: 302 })
const toast = useToast()
const inventory = ref<InstallationList | null>(null)
const loadingInventory = ref(false)
const connecting = ref(false)
const disconnecting = ref(false)
const updatingAdmin = ref(false)
const mutating = ref<string | null>(null)
const token = ref('')
const error = ref('')
const showCreate = ref(false)
const tokenDialogOpen = ref(false)
const disconnectDialogOpen = ref(false)

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
const adminUpdateAvailable = computed(() => isNewerRelease(
  session.value?.version || null,
  session.value?.latestAdminVersion || null,
))
const accountMenuItems = computed(() => [
  [
    {
      label: 'GitHub releases',
      icon: 'i-ph-github-logo',
      to: GITHUB_RELEASES_URL,
      target: '_blank',
    },
    ...(session.value?.credentialMode === 'account-token'
      ? [{ label: 'Replace account token', icon: 'i-ph-key', onSelect: () => { tokenDialogOpen.value = true } }]
      : []),
  ],
  [
    ...(session.value?.tokenConnected
      ? [{ label: session.value?.credentialMode === 'managed-oauth' ? 'Disconnect managed access' : 'Disconnect account token', icon: 'i-ph-plugs-connected', color: 'error' as const, onSelect: () => { disconnectDialogOpen.value = true } }]
      : []),
    { label: 'Log out', icon: 'i-ph-sign-out', onSelect: logOut },
  ],
])

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

async function readFreshSession() {
  session.value = await $fetch<AdminSession>('/api/session', {
    query: { activation: Date.now() },
  })
}

async function logOut() {
  await $fetch(ADMIN_LOGOUT_PATH, { method: 'POST' })
  await navigateTo('/login')
}

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

async function connectToken(closeDialog = false) {
  const wasConnected = Boolean(session.value?.tokenConnected)
  connecting.value = true
  error.value = ''
  try {
    await $fetch('/api/token', { method: 'POST', body: { token: token.value } })
    token.value = ''
    if (wasConnected) await readFreshSession()
    else {
      await waitForConnectedSession({
        refresh: readFreshSession,
        isConnected: () => Boolean(session.value?.tokenConnected),
      })
    }
    await loadInventory()
    if (closeDialog) tokenDialogOpen.value = false
    toast.add({ title: wasConnected ? 'Account token replaced' : 'Cloudflare account connected', color: 'success', icon: 'i-ph-check-circle' })
  }
  catch (cause) {
    error.value = errorMessage(cause)
  }
  finally {
    connecting.value = false
  }
}

async function disconnectToken() {
  disconnecting.value = true
  error.value = ''
  try {
    await $fetch('/api/token', { method: 'DELETE' })
    await waitForDisconnectedSession({
      refresh: readFreshSession,
      isConnected: () => Boolean(session.value?.tokenConnected),
    })
    inventory.value = null
    disconnectDialogOpen.value = false
    toast.add({ title: 'Cloudflare account disconnected', color: 'success', icon: 'i-ph-check-circle' })
  }
  catch (cause) {
    error.value = errorMessage(cause)
  }
  finally {
    disconnecting.value = false
  }
}

async function updateAdmin() {
  const targetVersion = session.value?.latestAdminVersion
  if (!targetVersion) return
  updatingAdmin.value = true
  error.value = ''
  try {
    await $fetch('/api/update', { method: 'POST', body: { targetVersion } })
    await waitForAdminVersion({
      refresh: readFreshSession,
      currentVersion: () => session.value?.version || null,
      targetVersion,
    })
    toast.add({ title: `Discoflare Admin updated to ${targetVersion}`, color: 'success', icon: 'i-ph-check-circle' })
  }
  catch (cause) {
    error.value = errorMessage(cause)
  }
  finally {
    updatingAdmin.value = false
  }
}

async function createInstallation() {
  mutating.value = 'create'
  error.value = ''
  try {
    const response = await fetch('/api/installations', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/x-ndjson', 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const deployed = await readDeployStream(response)
    if (!deployed.verified) await verifyWorkspaceDeployment(deployed)
    showCreate.value = false
    await loadInventory()
    await navigateTo(deployed.setupUrl || deployed.url, { external: true, open: { target: '_blank' } })
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
    const response = await fetch(`/api/installations/${encodeURIComponent(workerName)}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/x-ndjson', 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetVersion: latestVersion.value ? `v${latestVersion.value}` : undefined }),
    })
    const deployed = await readDeployStream(response)
    if (!deployed.verified) await verifyWorkspaceDeployment(deployed)
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
        <UDropdownMenu v-if="session" :items="accountMenuItems" :content="{ align: 'end' }">
          <UButton color="neutral" variant="ghost" trailing-icon="i-ph-caret-down" class="-mr-3">
            <span class="text-right">
              <span class="block text-sm font-medium text-highlighted">{{ session.accountName }}</span>
              <span class="block text-xs font-normal text-muted">{{ session.email }}</span>
            </span>
          </UButton>
        </UDropdownMenu>
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

        <UAlert
          v-if="session?.tokenConnected && adminUpdateAvailable"
          class="mt-6"
          color="primary"
          variant="subtle"
          icon="i-ph-arrow-circle-up"
          :title="`Discoflare Admin ${session.latestAdminVersion} is available`"
          :description="`This control plane is running ${session.version}. Installations remain online during the update.`"
          :actions="[{ label: `Update Admin to ${session.latestAdminVersion}`, loading: updatingAdmin, onClick: updateAdmin }]"
        />

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
            <form class="space-y-4 rounded-xl border border-default bg-elevated p-5" @submit.prevent="connectToken(false)">
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
            :actions="[{ label: 'GitHub release', to: GITHUB_RELEASES_URL, target: '_blank', color: 'neutral', variant: 'outline' }]"
          />

          <UCard v-if="showCreate" class="mt-8" :ui="{ body: 'p-6 sm:p-8' }">
            <div class="flex items-start justify-between gap-4">
              <div><h2 class="text-lg font-semibold text-highlighted">New installation in {{ session.accountName }}</h2><p class="mt-1 text-sm text-muted">Live is enabled automatically. The first domain-backed installation also receives workspace email.</p></div>
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
                    <UBadge v-if="installation.resources.primary" label="Mail primary" color="neutral" variant="subtle" />
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

    <UModal v-model:open="tokenDialogOpen" title="Replace Account Admin Token" description="The new token replaces the encrypted secret stored in this Worker.">
      <template #body>
        <form id="replace-token-form" class="space-y-4" @submit.prevent="connectToken(true)">
          <UButton :to="session?.tokenTemplateUrl" target="_blank" external block color="neutral" variant="outline" label="Create Account Admin Token" trailing-icon="i-ph-arrow-up-right" />
          <UFormField label="Account Admin Token" required>
            <UInput v-model="token" type="password" autocomplete="off" autofocus class="w-full" />
          </UFormField>
        </form>
      </template>
      <template #footer="{ close }">
        <UButton label="Cancel" color="neutral" variant="outline" @click="close" />
        <UButton type="submit" form="replace-token-form" label="Replace token" :loading="connecting" :disabled="!token.trim()" />
      </template>
    </UModal>

    <UModal v-model:open="disconnectDialogOpen" title="Disconnect Cloudflare account" description="Admin will stop managing installations until Cloudflare access is connected again.">
      <template #footer="{ close }">
        <UButton label="Cancel" color="neutral" variant="outline" @click="close" />
        <UButton label="Disconnect" color="error" :loading="disconnecting" @click="disconnectToken" />
      </template>
    </UModal>
  </div>
</template>
