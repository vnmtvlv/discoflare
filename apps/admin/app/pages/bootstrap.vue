<script setup lang="ts">
import type { DeployProgressEvent } from '@discoflare/installer-core'
import { readDeployStream } from '../utils/deploy-stream'
import { verifyWorkspaceDeployment } from '../utils/deployment-health'

const detail = ref('Connecting Discoflare Admin')
const error = ref('')

function errorMessage(cause: unknown) {
  if (!cause || typeof cause !== 'object') return 'Workspace installation failed.'
  const value = cause as { data?: { message?: string }, message?: string }
  return value.data?.message || value.message || 'Workspace installation failed.'
}

async function install() {
  error.value = ''
  try {
    const fragment = new URLSearchParams(window.location.hash.slice(1))
    const accessToken = fragment.get('token')?.trim() || ''
    window.history.replaceState({}, '', window.location.pathname)
    if (accessToken) {
      await $fetch('/api/auth/cloudflare', { method: 'POST', body: { accessToken } })
    }

    detail.value = 'Creating your workspace'
    const response = await fetch('/api/installations/bootstrap', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/x-ndjson', 'Content-Type': 'application/json' },
      body: '{}',
    })
    const deployed = await readDeployStream(response, (event: Extract<DeployProgressEvent, { type: 'progress' }>) => {
      detail.value = event.detail || `${event.step[0]?.toUpperCase()}${event.step.slice(1)}`
    })
    if (!deployed.verified) await verifyWorkspaceDeployment(deployed)
    window.location.replace(deployed.setupUrl || deployed.url)
  }
  catch (cause) {
    error.value = errorMessage(cause)
  }
}

onMounted(install)

useSeoMeta({
  title: 'Creating your Discoflare workspace',
  description: 'Finish the first Discoflare workspace installation.',
  robots: 'noindex, nofollow',
})
</script>

<template>
  <main class="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
    <div class="noise-grid pointer-events-none absolute inset-0" />
    <UCard class="relative w-full max-w-md" :ui="{ body: 'p-7 sm:p-9' }">
      <AdminBrand />
      <h1 class="mt-8 text-2xl font-semibold tracking-tight text-highlighted">Creating your workspace</h1>
      <div v-if="!error" class="mt-7 flex items-center gap-3 text-sm text-muted">
        <UIcon name="i-ph-spinner-gap" class="size-5 shrink-0 animate-spin" />
        {{ detail }}
      </div>
      <template v-else>
        <UAlert class="mt-6" color="error" variant="subtle" title="Installation stopped" :description="error" />
        <div class="mt-6 flex gap-3">
          <UButton label="Try again" leading-icon="i-ph-arrow-clockwise" @click="install" />
          <UButton to="/" label="Open Admin" color="neutral" variant="outline" />
        </div>
      </template>
    </UCard>
  </main>
</template>
