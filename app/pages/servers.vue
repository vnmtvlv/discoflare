<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { SetupHealth } from '~~/shared/types'
import { normalizeServerOrigin } from '~~/shared/client-router'

definePageMeta({ layout: 'default' })

const { native, servers, activeOrigin, add, select, remove } = useClientServers()
const toast = useToast()
const busy = ref(false)
const error = ref<string | null>(null)
const schema = z.object({ server: z.string().trim().min(1, 'Enter a server URL') })
type Schema = z.output<typeof schema>
const state = reactive<Partial<Schema>>({ server: 'https://sandbox.discoflare.com' })

if (!native) await navigateTo('/')

async function connect(event: FormSubmitEvent<Schema>) {
  busy.value = true
  error.value = null
  try {
    const origin = normalizeServerOrigin(event.data.server)
    const health = await $fetch<SetupHealth>(`${origin}/api/setup/health`, {
      credentials: 'include',
      timeout: 10_000,
    })
    add({ origin, name: health.appName || new URL(origin).hostname })
    window.location.assign('/')
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
  window.location.assign('/')
}

function forget(origin: string) {
  const wasActive = origin === activeOrigin.value
  remove(origin)
  toast.add({ title: 'Server removed' })
  if (wasActive && activeOrigin.value) window.location.assign('/')
}
</script>

<template>
  <main class="min-h-dvh overflow-y-auto bg-default px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] sm:px-8">
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

      <UForm :schema="schema" :state="state" class="mt-8 flex items-start gap-2" @submit="connect">
        <UFormField name="server" class="min-w-0 flex-1">
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
        <UButton type="submit" label="Connect" size="lg" :loading="busy" />
      </UForm>
      <UAlert v-if="error" color="error" variant="subtle" :title="error" class="mt-3" />
    </div>
  </main>
</template>
