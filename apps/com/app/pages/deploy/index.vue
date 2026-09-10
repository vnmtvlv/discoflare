<script setup lang="ts">
import { onBeforeRouteLeave } from 'vue-router'
import type { DiscoflareAdminBootstrapResponse, InstallerSessionResponse } from '~~/shared/installer'
import { installerOAuthError } from '../../utils/oauth-error'

const route = useRoute()
const oauthStartUrl = `/api/cloudflare/oauth/start?returnTo=${encodeURIComponent('/deploy')}`
const { data: session, status, refresh } = await useFetch<InstallerSessionResponse>('/api/cloudflare/session', {
  server: false,
  default: () => ({ connected: false, accounts: [], zones: [], managedAdmins: [] }),
})

const accountId = ref('')
const attemptedAccountId = ref('')
const installing = ref(false)
const result = shallowRef<DiscoflareAdminBootstrapResponse | null>(null)
const error = ref(installerOAuthError(route.query.error))

watch(() => session.value.accounts, (accounts) => {
  if (!accountId.value && accounts.length === 1) accountId.value = accounts[0]!.id
  if (accountId.value && !accounts.some(account => account.id === accountId.value)) accountId.value = ''
}, { immediate: true })

watch([() => session.value.connected, accountId], ([connected, selectedAccountId]) => {
  if (!connected || !selectedAccountId || attemptedAccountId.value === selectedAccountId) return
  attemptedAccountId.value = selectedAccountId
  void install()
}, { immediate: true })

const ready = computed(() => Boolean(accountId.value))

function warnBeforeUnload(event: BeforeUnloadEvent) {
  if (!installing.value) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => {
  window.addEventListener('beforeunload', warnBeforeUnload)
  if (typeof route.query.error === 'string') {
    const url = new URL(window.location.href)
    url.searchParams.delete('error')
    window.history.replaceState({}, '', `${url.pathname}${url.search}`)
  }
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeUnload))
onBeforeRouteLeave(() => installing.value ? window.confirm('Discoflare Admin may still be deploying. Keep this page open until it finishes.') : true)

async function disconnect() {
  await $fetch('/api/cloudflare/logout', { method: 'POST' })
  attemptedAccountId.value = ''
  accountId.value = ''
  result.value = null
  error.value = ''
  await refresh()
}

async function install() {
  if (!ready.value) return
  installing.value = true
  error.value = ''
  result.value = null
  try {
    const installed = await $fetch<DiscoflareAdminBootstrapResponse>('/api/cloudflare/managed-admin', {
      method: 'POST',
      body: { accountId: accountId.value },
    })
    if (!installed.handoffUrl) throw new Error('Discoflare Admin handoff was not returned.')
    const handoffUrl = installed.handoffUrl
    result.value = { ...installed, handoffUrl: undefined }
    window.location.replace(handoffUrl)
  }
  catch (cause) {
    const value = cause as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    error.value = value.data?.statusMessage || value.statusMessage || value.message || 'Managed Discoflare could not be installed.'
  }
  finally {
    installing.value = false
  }
}

useSeoMeta({
  title: 'Deploy Discoflare',
  description: 'Install the account-local Discoflare control plane with managed setup.',
  robots: 'noindex, nofollow',
})
</script>

<template>
  <div class="min-h-screen bg-default text-default">
    <UHeader to="/" title="Discoflare" class="border-b border-muted/70 bg-default/80 backdrop-blur-xl">
      <template #title><BrandLogo :linked="false" /></template>
      <template #right>
        <UColorModeButton color="neutral" variant="ghost" />
        <UButton to="/deploy/private" label="Private install" color="neutral" variant="ghost" />
      </template>
    </UHeader>

    <main>
      <UContainer class="py-12 sm:py-16">
        <div class="mx-auto max-w-2xl">
          <div class="text-center">
            <p class="text-sm font-medium text-primary">Managed setup</p>
            <h1 class="display-title mt-3 text-4xl font-semibold text-highlighted sm:text-5xl">Deploy Discoflare</h1>
            <p class="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted sm:text-base">Choose a Cloudflare account. Discoflare installs the account-local Admin, creates your first workspace, and opens Owner setup.</p>
          </div>

          <ClientOnly>
            <UCard class="mt-8" :ui="{ body: 'p-6 sm:p-8' }">
              <div v-if="status === 'pending'" class="flex min-h-56 items-center justify-center gap-3 text-muted">
                <UIcon name="i-ph-spinner-gap" class="size-5 animate-spin" />
                Checking managed profile
              </div>

              <div v-else-if="result" class="py-3 text-center">
                <div class="mx-auto flex size-12 items-center justify-center rounded-full bg-success/15"><UIcon name="i-ph-check" class="size-7 text-success" /></div>
                <h2 class="mt-5 text-xl font-semibold text-highlighted">Opening your workspace</h2>
                <p class="mt-2 text-sm leading-6 text-muted">Discoflare Admin is ready. The first workspace will be created next.</p>
                <UButton class="mt-6" :to="result.origin" external label="Open Admin" trailing-icon="i-ph-arrow-right" size="lg" />
                <div class="-mx-6 -mb-6 mt-8 flex items-center justify-between gap-3 border-t border-muted px-6 py-5 text-left sm:-mx-8 sm:-mb-8 sm:px-8">
                  <p class="text-xs text-muted">Runtime calls, including RealtimeKit, go from each workspace to your Admin.</p>
                  <UButton type="button" label="Back to profile" color="neutral" variant="ghost" @click="result = null" />
                </div>
              </div>

              <div v-else-if="session.connected" class="space-y-6">
                <div class="flex items-start justify-between gap-4">
                  <div><h2 class="text-lg font-semibold text-highlighted">Choose your Cloudflare account</h2><p class="mt-1 text-sm text-muted">The managed installer creates one discoflare-admin Worker for this account.</p></div>
                  <UButton type="button" label="Sign out" color="neutral" variant="ghost" size="sm" :disabled="installing" @click="disconnect" />
                </div>
                <UFormField label="Cloudflare account" required><USelect v-model="accountId" :items="session.accounts.map(account => ({ label: account.name, value: account.id }))" value-key="value" class="w-full" /></UFormField>
                <UAlert color="neutral" variant="subtle" title="What is created" description="OAuth installs Admin and a base workers.dev workspace with D1, R2, and KV. R2 must already be enabled; Workers Paid is only needed later for Agent Computer. Cloudflare Access is not installed." />
                <UAlert v-if="error" color="error" variant="subtle" title="Installation stopped" :description="error" />
                <UButton v-if="error" type="button" label="Try again" leading-icon="i-ph-arrow-clockwise" size="lg" block :disabled="!ready" @click="install" />
                <div v-else class="flex items-center justify-center gap-3 py-2 text-sm text-muted">
                  <UIcon name="i-ph-spinner-gap" class="size-5 animate-spin" />
                  {{ installing ? 'Installing Discoflare Admin' : 'Waiting for an account' }}
                </div>
              </div>

              <div v-else class="space-y-6">
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <h2 class="text-lg font-semibold text-highlighted">Your managed installations</h2>
                    <p class="mt-1 text-sm text-muted">Reconnect Cloudflare to install or repair Admin. Existing workspaces remain independent of discoflare.com.</p>
                  </div>
                  <UButton
                    v-if="session.managedAdmins.length"
                    type="button"
                    label="Sign out"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    @click="disconnect"
                  />
                </div>
                <div v-if="session.managedAdmins.length" class="space-y-3">
                  <div v-for="admin in session.managedAdmins" :key="admin.accountId" class="flex items-center justify-between gap-4 rounded-xl border border-default p-4">
                    <div class="min-w-0"><p class="truncate text-sm font-medium text-highlighted">{{ admin.accountName }}</p><p class="mt-1 truncate text-xs text-muted">{{ admin.workerName }} · {{ admin.version }}</p></div>
                    <UButton :to="admin.origin" target="_blank" label="Open Admin" trailing-icon="i-ph-arrow-up-right" color="neutral" variant="outline" />
                  </div>
                </div>
                <UAlert v-if="error" color="error" variant="subtle" :title="error" />
                <UAlert color="neutral" variant="subtle" title="Before you continue" description="R2 must be enabled on the Cloudflare account. Workers Paid is not required for the base workspace." />
                <UButton :to="oauthStartUrl" external label="Connect Cloudflare" trailing-icon="i-ph-arrow-right" size="xl" block />
                <p class="text-center text-xs text-muted">Want zero discoflare.com state? Use the <NuxtLink to="/deploy/private" class="text-primary hover:underline">private installer</NuxtLink>.</p>
              </div>
            </UCard>

            <template #fallback>
              <UCard class="mt-8"><div class="flex min-h-56 items-center justify-center gap-3 text-muted"><UIcon name="i-ph-spinner-gap" class="size-5 animate-spin" />Checking managed profile</div></UCard>
            </template>
          </ClientOnly>
        </div>
      </UContainer>
    </main>
  </div>
</template>
