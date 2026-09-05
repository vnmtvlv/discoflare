<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { SetupHealth } from '~~/shared/types'
import { clientAppEntryUrl, normalizeServerOrigin } from '~~/shared/client-router'

definePageMeta({ layout: 'default' })

const { native, servers, activeOrigin, add, select, remove } = useClientServers()
const toast = useToast()
const busy = ref(false)
const error = ref<string | null>(null)
const schema = z.object({ server: z.string().trim().min(1, 'Enter a server URL') })
type Schema = z.output<typeof schema>
const state = reactive<Partial<Schema>>({ server: 'https://sandbox.discoflare.com' })
const deployUrl = 'https://discoflare.com/deploy'

if (!native) await navigateTo('/')

async function connect(event: FormSubmitEvent<Schema>) {
  busy.value = true
  error.value = null
  try {
    const origin = normalizeServerOrigin(event.data.server)
    const granted = await window.__DISCOFLARE_EXTENSION__?.requestServerAccess(origin)
    if (granted === false) throw new Error('Allow access to this server to connect it')
    const health = await $fetch<SetupHealth>(`${origin}/api/setup/health`, {
      credentials: 'include',
      timeout: 10_000,
    })
    add({ origin, name: health.appName || new URL(origin).hostname })
    window.location.assign(clientAppEntryUrl(window.location.href))
  }
  catch (err) {
    error.value = errorMessage(err)
  }
  finally {
    busy.value = false
  }
}

function activate(origin: string) {
  select(origin)
  window.location.assign(clientAppEntryUrl(window.location.href))
}

function forget(origin: string) {
  const wasActive = origin === activeOrigin.value
  remove(origin)
  toast.add({ title: 'Server removed' })
  if (wasActive && activeOrigin.value) window.location.assign(clientAppEntryUrl(window.location.href))
}
</script>

<template>
  <main class="h-full overflow-y-auto bg-default px-5 pb-[max(2rem,var(--df-safe-area-bottom))] pt-[max(2rem,var(--df-safe-area-top))] sm:px-8">
    <div class="mx-auto max-w-xl">
      <div class="flex items-center gap-3">
        <BrandLogo class="size-9" />
        <h1 class="text-xl font-semibold text-highlighted">Servers</h1>
      </div>

      <div v-if="servers.length" class="mt-8 space-y-2">
        <div
          v-for="server in servers"
          :key="server.origin"
          class="flex items-center gap-3 rounded-lg border border-default bg-elevated p-3"
        >
          <UAvatar :text="server.name.slice(0, 2).toUpperCase()" size="md" />
          <button type="button" class="min-w-0 flex-1 text-start" @click="activate(server.origin)">
            <span class="block truncate font-medium text-highlighted">{{ server.name }}</span>
            <span class="block truncate text-xs text-muted">{{ server.origin }}</span>
          </button>
          <UIcon v-if="server.origin === activeOrigin" name="i-ph-check-circle-fill" class="size-5 text-primary" />
          <UButton
            icon="i-ph-trash"
            color="neutral"
            variant="ghost"
            square
            aria-label="Remove server"
            @click="forget(server.origin)"
          />
        </div>
      </div>

      <UButton
        :to="deployUrl"
        target="_blank"
        rel="noopener noreferrer"
        icon="i-ph-cloud-arrow-up"
        label="Create new workspace"
        size="lg"
        block
        class="mt-8"
      />

      <USeparator label="or connect existing" class="my-6" />

      <UForm :schema="schema" :state="state" class="flex flex-col gap-2 sm:flex-row sm:items-start" @submit="connect">
        <UFormField name="server" class="w-full min-w-0 flex-1">
          <UInput
            v-model="state.server"
            type="url"
            inputmode="url"
            autocapitalize="none"
            autocomplete="url"
            placeholder="https://chat.example.com"
            size="lg"
            class="w-full"
          />
        </UFormField>
        <UButton type="submit" label="Connect" size="lg" :loading="busy" class="w-full justify-center sm:w-auto" />
      </UForm>
      <UAlert v-if="error" color="error" variant="subtle" :title="error" class="mt-3" />
    </div>
  </main>
</template>
