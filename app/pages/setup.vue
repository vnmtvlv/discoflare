<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'auth' })

const session = useSessionStore()
const { api } = useApi()
const health = computed(() => session.health)
const busy = ref(false)
const error = ref<string | null>(null)
const claimToken = ref('')

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  password: z.string().min(12, 'Use at least 12 characters'),
  confirm: z.string().min(12),
}).superRefine((value, context) => {
  if (value.password !== value.confirm) context.addIssue({ code: 'custom', path: ['confirm'], message: 'Passwords do not match' })
})
type Schema = z.output<typeof schema>
const state = reactive<Partial<Schema>>({ name: '', password: '', confirm: '' })

const missing = computed(() => {
  const bindings = health.value?.bindings
  const out: string[] = []
  if (bindings && !bindings.db) out.push('database')
  if (bindings && !bindings.r2) out.push('files')
  if (bindings && !bindings.kv) out.push('tickets')
  if (bindings && !bindings.channelDo) out.push('channel')
  if (bindings && !bindings.workspaceDo) out.push('workspace')
  if (bindings && !bindings.rateLimitDo) out.push('rate limit')
  if (bindings && !bindings.notificationDo) out.push('notifications')
  if (health.value && !health.value.migrated) out.push('migrations')
  return out
})

onMounted(async () => {
  const fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get('claim') || ''
  if (fragmentToken) {
    claimToken.value = fragmentToken
    sessionStorage.setItem('df:owner-setup-token', fragmentToken)
    window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`)
  }
  else {
    claimToken.value = sessionStorage.getItem('df:owner-setup-token') || ''
  }

  await session.refresh(api)
  if (session.user) await navigateTo('/')
  else if (session.health?.ready) await navigateTo('/login')
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  busy.value = true
  error.value = null
  try {
    await api('/api/setup/owner', {
      method: 'POST',
      body: {
        token: claimToken.value,
        name: event.data.name,
        password: event.data.password,
      },
    })
    sessionStorage.removeItem('df:owner-setup-token')
    await session.refresh(api)
    await navigateTo('/')
  }
  catch (cause) {
    error.value = errorMessage(cause)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold tracking-tight text-highlighted">Create workspace owner</h1>
    <p class="mt-1.5 text-sm text-muted">Set the password here so your browser saves it for this workspace.</p>

    <div v-if="!health" class="mt-6 flex items-center gap-3 text-muted">
      <UIcon name="i-ph-spinner-gap" class="size-5 animate-spin" />
      Checking workspace
    </div>

    <UAlert
      v-else-if="missing.length"
      color="error"
      variant="subtle"
      :title="`Not ready: ${missing.join(', ')}`"
      class="mt-6"
    />

    <template v-else-if="health?.ownerSetup">
      <UAlert
        v-if="!claimToken"
        color="warning"
        variant="subtle"
        title="Open the private setup link from the Discoflare installer."
        class="mt-6"
      />
      <template v-else>
        <p v-if="health.ownerEmailHint" class="mt-6 text-sm text-muted">Owner email: {{ health.ownerEmailHint }}</p>
        <UAlert v-if="error" color="error" variant="subtle" :title="error" class="mt-6" />
        <UForm :schema="schema" :state="state" class="mt-7 space-y-4" @submit="onSubmit">
          <UFormField name="name" label="Name">
            <UInput v-model="state.name" size="lg" autocomplete="name" class="w-full" />
          </UFormField>
          <UFormField name="password" label="Password">
            <UInput v-model="state.password" type="password" size="lg" autocomplete="new-password" class="w-full" />
          </UFormField>
          <UFormField name="confirm" label="Confirm password">
            <UInput v-model="state.confirm" type="password" size="lg" autocomplete="new-password" class="w-full" />
          </UFormField>
          <UButton type="submit" size="lg" label="Create owner" block :loading="busy" />
        </UForm>
      </template>
    </template>

    <UAlert
      v-else-if="health?.adminEnv"
      color="neutral"
      variant="subtle"
      title="Creating the owner from deployment settings…"
      class="mt-6"
    />
    <UAlert
      v-else
      color="warning"
      variant="subtle"
      title="Owner setup is not configured."
      class="mt-6"
    />
  </div>
</template>
