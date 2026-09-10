<script setup lang="ts">
import { onBeforeRouteLeave } from 'vue-router'
import type { DiscoflareAdminBootstrapResponse, InstallerSessionResponse } from '~~/shared/installer'
import { readAdminBootstrapStream } from '../../utils/admin-bootstrap-stream'
import { installerOAuthError } from '../../utils/oauth-error'

const route = useRoute()
const workspaceOrigin = typeof route.query.workspace === 'string'
  ? route.query.workspace
  : typeof route.query.upgrade === 'string' ? route.query.upgrade : ''
const oauthStartUrl = `/api/cloudflare/oauth/start?returnTo=${encodeURIComponent(route.fullPath)}`
const { data: session, status, refresh } = await useFetch<InstallerSessionResponse>('/api/cloudflare/session', {
  server: false,
  default: () => ({ connected: false, accounts: [], zones: [], managedAdmins: [] }),
})

const accountId = ref('')
const installing = ref(false)
const result = shallowRef<DiscoflareAdminBootstrapResponse | null>(null)
const error = ref(installerOAuthError(route.query.error))

watch(() => session.value.accounts, (accounts) => {
  if (!accountId.value && accounts[0]) accountId.value = accounts[0].id
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
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeUnload))
onBeforeRouteLeave(() => installing.value ? window.confirm('Discoflare Admin may still be deploying. Keep this page open until it finishes.') : true)

async function disconnect() {
  await $fetch('/api/cloudflare/logout', { method: 'POST' })
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
    const response = await fetch('/api/cloudflare/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: accountId.value }),
    })
    result.value = await readAdminBootstrapStream(response)
  }
  catch (cause) {
    const value = cause as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    error.value = value.data?.statusMessage || value.statusMessage || value.message || 'Discoflare Admin could not be installed.'
  }
  finally {
    installing.value = false
  }
}

useSeoMeta({
  title: 'Install Discoflare Admin',
  description: 'Bootstrap the account-local control plane for Discoflare.',
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
      <UContainer class="py-12 sm:py-16">
        <div class="mx-auto max-w-2xl">
          <div class="text-center">
            <p class="text-sm font-medium text-primary">Temporary Cloudflare installer</p>
            <h1 class="display-title mt-3 text-4xl font-semibold text-highlighted sm:text-5xl">Install Discoflare Admin</h1>
            <p class="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted sm:text-base">One small Worker in your account manages all of your Discoflare installations.</p>
          </div>

          <ClientOnly>
            <UCard class="mt-8" :ui="{ body: 'p-6 sm:p-8' }">
              <div v-if="status === 'pending'" class="flex min-h-56 items-center justify-center gap-3 text-muted">
                <UIcon name="i-ph-spinner-gap" class="size-5 animate-spin" />
                Checking Cloudflare connection
              </div>

              <div v-else-if="!session.connected" class="space-y-6">
                <div>
                  <h2 class="text-lg font-semibold text-highlighted">Bootstrap only</h2>
                  <p class="mt-1 text-sm text-muted">Discoflare.com creates or repairs only the Admin Worker, then gives up its temporary OAuth access.</p>
                </div>
                <div class="space-y-3">
                  <div class="flex gap-4 rounded-xl border border-default p-4">
                    <UIcon name="i-ph-lock-key" class="mt-0.5 size-5 shrink-0 text-primary" />
                    <div><p class="text-sm font-medium text-highlighted">Temporary OAuth</p><p class="mt-1 text-sm text-muted">Used for this bootstrap session; no Cloudflare credential is retained by discoflare.com.</p></div>
                  </div>
                  <div class="flex gap-4 rounded-xl border border-default p-4">
                    <UIcon name="i-ph-shield-check" class="mt-0.5 size-5 shrink-0 text-primary" />
                    <div><p class="text-sm font-medium text-highlighted">Cloudflare sign-in</p><p class="mt-1 text-sm text-muted">Admin verifies the Cloudflare identity that performed this bootstrap. No Access application is installed.</p></div>
                  </div>
                  <div class="flex gap-4 rounded-xl border border-default p-4">
                    <UIcon name="i-ph-key" class="mt-0.5 size-5 shrink-0 text-primary" />
                    <div><p class="text-sm font-medium text-highlighted">Your token stays in your account</p><p class="mt-1 text-sm text-muted">After bootstrap, paste the Account Admin Token directly into your own Admin Worker.</p></div>
                  </div>
                </div>
                <UAlert v-if="workspaceOrigin" color="neutral" variant="subtle" title="Existing installation detected" :description="`${workspaceOrigin} will appear in Admin after you connect the account token.`" />
                <UAlert v-if="error" color="error" variant="subtle" :title="error" />
                <UButton :to="oauthStartUrl" external label="Connect Cloudflare" trailing-icon="i-ph-arrow-right" size="xl" block />
              </div>

              <div v-else-if="result" class="py-3 text-center">
                <div class="mx-auto flex size-12 items-center justify-center rounded-full bg-success/15"><UIcon name="i-ph-check" class="size-7 text-success" /></div>
                <h2 class="mt-5 text-xl font-semibold text-highlighted">Discoflare Admin {{ result.version }} is ready</h2>
                <p class="mt-2 text-sm leading-6 text-muted">Sign in with Cloudflare, then connect the Account Admin Token on that private origin.</p>
                <UButton class="mt-6" :to="result.origin" target="_blank" label="Open Discoflare Admin" trailing-icon="i-ph-arrow-up-right" size="lg" />
                <div class="-mx-6 -mb-6 mt-8 flex items-center justify-between gap-3 border-t border-muted px-6 py-5 text-left sm:-mx-8 sm:-mb-8 sm:px-8">
                  <p class="text-xs text-muted">Discoflare.com no longer has authority over your account.</p>
                  <UButton type="button" label="Disconnect OAuth" color="neutral" variant="ghost" @click="disconnect" />
                </div>
              </div>

              <form v-else class="space-y-6" @submit.prevent="install">
                <div class="flex items-start justify-between gap-4">
                  <div><h2 class="text-lg font-semibold text-highlighted">Choose the Admin owner</h2><p class="mt-1 text-sm text-muted">The Worker name is always discoflare-admin.</p></div>
                  <UButton type="button" label="Sign out" color="neutral" variant="ghost" size="sm" @click="disconnect" />
                </div>
                <UFormField label="Cloudflare account" required><USelect v-model="accountId" :items="session.accounts.map(account => ({ label: account.name, value: account.id }))" value-key="value" class="w-full" /></UFormField>
                <UAlert color="neutral" variant="subtle" title="What is installed" description="One small workers.dev Worker. No Access application, workspace, D1, R2, KV, RealtimeKit app, email route, or permanent token is created here." />
                <UAlert v-if="error" color="error" variant="subtle" title="Installation stopped" :description="error" />
                <UButton type="submit" label="Install Discoflare Admin" trailing-icon="i-ph-arrow-right" size="lg" block :disabled="!ready" :loading="installing" />
              </form>
            </UCard>

            <template #fallback>
              <UCard class="mt-8"><div class="flex min-h-56 items-center justify-center gap-3 text-muted"><UIcon name="i-ph-spinner-gap" class="size-5 animate-spin" />Checking Cloudflare connection</div></UCard>
            </template>
          </ClientOnly>
        </div>
      </UContainer>
    </main>
  </div>
</template>
