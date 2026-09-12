<script setup lang="ts">
import type { CloudflareInstallation, InstallerSessionResponse, UninstallResponse } from '../../shared/installer'

const route = useRoute()
const origin = (() => {
  if (typeof route.query.origin !== 'string') return ''
  try {
    const url = new URL(route.query.origin)
    return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash
      ? url.origin
      : ''
  }
  catch {
    return ''
  }
})()
const hostname = origin ? new URL(origin).hostname : ''

const returnPath = origin ? `/uninstall?origin=${encodeURIComponent(origin)}` : '/uninstall'
const oauthStartUrl = `/api/cloudflare/oauth/start?returnTo=${encodeURIComponent(returnPath)}`
const storageKey = origin ? `discoflare-uninstall:${origin}` : ''
const claim = ref('')
const installation = shallowRef<CloudflareInstallation | null>(null)
const installationLoading = ref(false)
const installationError = ref('')
const confirmation = ref('')
const acknowledged = ref(false)
const deleting = ref(false)
const error = ref('')
const result = shallowRef<UninstallResponse | null>(null)

const { data: session, status, refresh } = await useFetch<InstallerSessionResponse>('/api/cloudflare/session', {
  server: false,
  default: () => ({ connected: false, accounts: [], zones: [], managedAdmins: [], handoff: null }),
})

onMounted(() => {
  const fragment = new URLSearchParams(window.location.hash.slice(1)).get('claim') || ''
  if (/^[0-9a-f]{64}$/u.test(fragment) && storageKey) sessionStorage.setItem(storageKey, fragment)
  claim.value = storageKey ? sessionStorage.getItem(storageKey) || '' : ''
  if (window.location.hash) history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
})

async function disconnect() {
  await $fetch('/api/cloudflare/logout', { method: 'POST' })
  installation.value = null
  await refresh()
}

async function loadInstallation() {
  if (!origin || !session.value.connected || result.value) return
  installationLoading.value = true
  installationError.value = ''
  try {
    const response = await $fetch<{ installations: CloudflareInstallation[] }>('/api/cloudflare/installations', { query: { origin } })
    if (response.installations.length !== 1) {
      installationError.value = response.installations.length
        ? 'More than one matching Discoflare installation was found.'
        : 'No matching managed Discoflare installation is available to this Cloudflare account.'
      installation.value = null
      return
    }
    installation.value = response.installations[0]!
  }
  catch (cause) {
    const value = cause as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    installationError.value = value.data?.statusMessage || value.statusMessage || value.message || 'Could not inspect this Discoflare installation.'
  }
  finally {
    installationLoading.value = false
  }
}

watch(() => session.value.connected, (connected) => {
  if (connected) void loadInstallation()
}, { immediate: true })

async function uninstall() {
  if (!installation.value || confirmation.value.trim() !== installation.value.origin || !acknowledged.value) return
  deleting.value = true
  error.value = ''
  try {
    result.value = await $fetch<UninstallResponse>('/api/cloudflare/uninstall', {
      method: 'POST',
      body: {
        accountId: installation.value.accountId,
        workerName: installation.value.workerName,
        origin: installation.value.origin,
        confirmation: confirmation.value,
        claim: claim.value,
      },
    })
    if (storageKey) sessionStorage.removeItem(storageKey)
  }
  catch (cause) {
    const value = cause as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    error.value = value.data?.statusMessage || value.statusMessage || value.message || 'Server deletion failed.'
  }
  finally {
    deleting.value = false
  }
}

useSeoMeta({
  title: 'Delete Discoflare server',
  description: 'Permanently delete a managed Discoflare installation from Cloudflare.',
  robots: 'noindex, nofollow',
})
</script>

<template>
  <div class="min-h-screen bg-default text-default">
    <UHeader to="/" title="Discoflare" class="border-b border-muted/70 bg-default/80 backdrop-blur-xl">
      <template #title><BrandLogo :linked="false" /></template>
      <template #right>
        <UColorModeButton color="neutral" variant="ghost" />
        <UButton to="/" label="Back home" trailing-icon="i-ph-arrow-left" color="neutral" variant="ghost" />
      </template>
    </UHeader>

    <main>
      <UContainer class="py-14 sm:py-20">
        <div class="mx-auto max-w-2xl">
          <p class="text-sm font-medium text-error">Danger Zone</p>
          <h1 class="display-title mt-3 text-4xl font-semibold text-highlighted sm:text-6xl">Delete Discoflare server</h1>
          <p class="mt-4 max-w-xl text-base leading-7 text-muted">
            This removes the managed installation and its live data from your Cloudflare account. It cannot be undone.
          </p>

          <UAlert
            v-if="!origin"
            class="mt-10"
            color="error"
            variant="subtle"
            title="Open this page from Workspace Settings → Danger Zone"
          />

          <template v-else-if="result">
            <UAlert
              class="mt-10"
              color="success"
              variant="subtle"
              title="Server deleted"
              :description="`${result.origin} and ${result.deletedResources.length} managed Cloudflare resources were removed. ${result.deletedObjects} live file objects were deleted.`"
            />
            <UAlert
              v-if="result.remainingResources.length"
              class="mt-4"
              color="warning"
              variant="subtle"
              title="Some detached resources need manual cleanup"
              :description="result.remainingResources.join(', ')"
            />
          </template>

          <ClientOnly v-else-if="origin">
            <div v-if="status === 'pending'" class="mt-10 flex items-center gap-3 text-muted">
              <UIcon name="i-ph-spinner-gap" class="size-5 animate-spin" />
              Checking Cloudflare connection
            </div>

            <div v-else-if="!session.connected" class="mt-10">
              <UButton :to="oauthStartUrl" external label="Connect Cloudflare" trailing-icon="i-ph-arrow-right" size="xl" />
              <div class="mt-5 flex items-start gap-3 rounded-xl border border-default bg-elevated p-4">
                <UIcon name="i-ph-shield-check" class="mt-0.5 size-5 shrink-0 text-primary" />
                <div class="text-sm leading-6 text-muted">
                  <p class="font-medium text-highlighted">The grant is temporary</p>
                  <p class="mt-1">Connect the Cloudflare account that owns {{ origin }}. The token stays only in this installer session.</p>
                </div>
              </div>
            </div>

            <div v-else class="mt-10 space-y-6">
              <UCard :ui="{ body: 'space-y-5 p-6 sm:p-8' }">
                <div class="flex items-center justify-between gap-4">
                  <h2 class="text-lg font-semibold text-highlighted">Cloudflare installation</h2>
                  <UButton type="button" label="Disconnect" color="neutral" variant="ghost" size="sm" @click="disconnect" />
                </div>

                <div v-if="installationLoading" class="flex items-center gap-3 py-3 text-sm text-muted">
                  <UIcon name="i-ph-spinner-gap" class="size-5 animate-spin" />
                  Finding this installation
                </div>
                <UAlert v-else-if="installationError" color="error" :title="installationError" />
                <div v-else-if="installation" class="rounded-lg border border-default bg-elevated p-4">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p class="text-sm font-medium text-highlighted">{{ installation.configuration.appName }}</p>
                      <p class="mt-1 text-sm text-muted">{{ installation.origin }}</p>
                    </div>
                    <UBadge :label="installation.version ? `Discoflare ${installation.version}` : 'Legacy installation'" color="neutral" variant="subtle" />
                  </div>
                  <dl class="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div><dt class="text-xs text-muted">Worker</dt><dd class="mt-0.5 text-default">{{ installation.workerName }}</dd></div>
                    <div><dt class="text-xs text-muted">Live storage</dt><dd class="mt-0.5 text-default">D1, R2, and KV</dd></div>
                    <div><dt class="text-xs text-muted">Runtime</dt><dd class="mt-0.5 text-default">Durable Objects, Workflow, and Container</dd></div>
                    <div><dt class="text-xs text-muted">Domain</dt><dd class="mt-0.5 text-default">{{ hostname }}</dd></div>
                  </dl>
                </div>
              </UCard>

              <UAlert
                color="warning"
                variant="subtle"
                title="A backup is optional and must happen before deletion"
                description="This installer does not create a backup. Return to the workspace now if you want to download one or upload one to your external bucket. That external backup bucket will not be deleted."
              >
                <template #actions>
                  <UButton :to="`${origin}/w/main/settings?section=backups`" external label="Return to backups" color="warning" variant="soft" trailing-icon="i-ph-arrow-up-right" />
                </template>
              </UAlert>

              <UCard v-if="installation" :ui="{ body: 'space-y-5 p-6 sm:p-8' }">
                <div>
                  <h2 class="text-lg font-semibold text-error">Confirm permanent deletion</h2>
                  <p class="mt-2 text-sm leading-6 text-muted">
                    Type <span class="font-mono text-default">{{ installation.origin }}</span> to confirm.
                  </p>
                </div>
                <UFormField label="Server address" required>
                  <UInput v-model="confirmation" autocomplete="off" autocapitalize="none" spellcheck="false" class="w-full" />
                </UFormField>
                <UCheckbox
                  v-model="acknowledged"
                  label="I understand that the live database and files will be permanently deleted."
                />
                <UAlert v-if="!claim" color="error" variant="subtle" title="Deletion authorization is missing or expired" description="Open Danger Zone in the workspace again." />
                <UAlert v-if="error" color="error" variant="subtle" :title="error" />
                <UButton
                  label="Permanently delete server"
                  trailing-icon="i-ph-trash"
                  color="error"
                  size="xl"
                  :loading="deleting"
                  :disabled="!claim || confirmation.trim() !== installation.origin || !acknowledged"
                  @click="uninstall"
                />
                <p v-if="deleting" class="text-sm text-muted">Keep this page open while Cloudflare removes the live data and runtime resources.</p>
              </UCard>
            </div>

            <template #fallback>
              <div class="mt-10 flex items-center gap-3 text-muted">
                <UIcon name="i-ph-spinner-gap" class="size-5 animate-spin" />
                Checking Cloudflare connection
              </div>
            </template>
          </ClientOnly>
        </div>
      </UContainer>
    </main>
  </div>
</template>
