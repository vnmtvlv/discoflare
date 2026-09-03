<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'auth' })

const session = useSessionStore()
const toast = useToast()
const busy = ref(false)
const error = ref<string | null>(null)
const health = computed(() => session.health)

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
  displayName: z.string().min(1, 'Required').max(80),
  guildName: z.string().min(1, 'Required').max(80),
})
type Schema = z.output<typeof schema>
const state = reactive<Partial<Schema>>({ email: '', password: '', displayName: '', guildName: 'HQ' })

const missing = computed(() => {
  const b = health.value?.bindings
  const out: string[] = []
  if (b && !b.db) out.push('database')
  if (b && !b.r2) out.push('files')
  if (b && !b.kv) out.push('sessions')
  if (b && !b.channelDo) out.push('channel')
  if (b && !b.guildDo) out.push('guild')
  if (b && !b.rateLimitDo) out.push('rate limit')
  if (health.value && !health.value.migrated) out.push('migrations')
  return out
})

onMounted(async () => {
  await session.refresh()
  if (session.user) {
    await navigateTo('/')
    return
  }
  if (session.health && session.health.users > 0) await navigateTo('/login')
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  busy.value = true
  error.value = null
  try {
    const res = await $fetch<{ guildId: string; channelId: string }>('/api/setup', {
      method: 'POST',
      body: event.data,
    })
    await session.refresh()
    await navigateTo(`/channels/${res.channelId}`)
  }
  catch (err) {
    error.value = errorMessage(err)
    toast.add({ title: error.value, color: 'error' })
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="text-xl font-medium tracking-tight text-highlighted">Create the workspace</h1>

    <UAlert
      v-if="health?.adminEnv"
      color="neutral"
      variant="subtle"
      title="Owner comes from ADMIN_EMAIL. Sign in with that account."
      class="mt-6"
    />
    <UAlert
      v-if="missing.length"
      color="error"
      variant="subtle"
      :title="`Not ready: ${missing.join(', ')}`"
      class="mt-6"
    />
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :title="error"
      class="mt-6"
    />

    <UForm v-if="!health?.adminEnv" :schema="schema" :state="state" class="mt-8 space-y-4" @submit="onSubmit">
      <UFormField name="email" label="Email">
        <UInput v-model="state.email" type="email" size="lg" autocomplete="username" class="w-full" />
      </UFormField>
      <UFormField name="password" label="Password">
        <UInput v-model="state.password" type="password" size="lg" autocomplete="new-password" class="w-full" />
      </UFormField>
      <UFormField name="displayName" label="Display name">
        <UInput v-model="state.displayName" size="lg" autocomplete="nickname" class="w-full" />
      </UFormField>
      <UFormField name="guildName" label="Guild name">
        <UInput v-model="state.guildName" size="lg" class="w-full" />
      </UFormField>
      <UButton type="submit" size="lg" label="Create workspace" block :loading="busy" :disabled="missing.length > 0" class="mt-2" />
    </UForm>
    <UButton v-else to="/login" size="lg" label="Sign in" block class="mt-8" />
  </div>
</template>
