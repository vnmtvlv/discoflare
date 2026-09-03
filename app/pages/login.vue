<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'auth', middleware: ['guest'] })

const session = useSessionStore()
const route = useRoute()
const toast = useToast()
const busy = ref(false)
const twitterBusy = ref(false)
const error = ref<string | null>(null)

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})
type Schema = z.output<typeof schema>
const state = reactive<Partial<Schema>>({ email: '', password: '' })

onMounted(async () => {
  await session.refresh()
  if (session.user) {
    await navigateTo(safeNextPath())
    return
  }
  if (session.health && session.health.users === 0) await navigateTo('/setup')
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  busy.value = true
  error.value = null
  try {
    await session.login(event.data.email, event.data.password)
    const next = typeof route.query.next === 'string' ? route.query.next : '/'
    await navigateTo(next)
  }
  catch (err) {
    error.value = errorMessage(err)
    toast.add({ title: error.value, color: 'error' })
  }
  finally {
    busy.value = false
  }
}

function safeNextPath() {
  const next = typeof route.query.next === 'string' ? route.query.next : '/'
  return next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

async function signInWithX() {
  twitterBusy.value = true
  error.value = null
  try {
    const callbackURL = new URL(safeNextPath(), window.location.origin).toString()
    const res = await $fetch<{ url?: string }>('/api/auth/sign-in/social', {
      method: 'POST',
      body: {
        provider: 'twitter',
        callbackURL,
        errorCallbackURL: `${window.location.origin}/login`,
        disableRedirect: true,
      },
    })
    if (!res.url) throw new Error('X sign-in did not return a redirect')
    window.location.assign(res.url)
  }
  catch (err) {
    error.value = errorMessage(err)
    toast.add({ title: error.value, color: 'error' })
    twitterBusy.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="text-xl font-medium tracking-tight text-highlighted">Sign in</h1>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :title="error"
      class="mt-6"
    />

    <template v-if="session.health?.twitterAuth">
      <UButton
        class="mt-8"
        size="lg"
        color="neutral"
        variant="outline"
        icon="i-ph-x-logo"
        label="Continue with X"
        block
        :loading="twitterBusy"
        @click="signInWithX"
      />
      <USeparator label="or" class="my-6" />
    </template>

    <UForm :schema="schema" :state="state" :class="session.health?.twitterAuth ? 'space-y-4' : 'mt-8 space-y-4'" @submit="onSubmit">
      <UFormField name="email" label="Email">
        <UInput
          v-model="state.email"
          type="email"
          size="lg"
          autocomplete="username"
          placeholder="you@example.com"
          class="w-full"
        />
      </UFormField>
      <UFormField name="password" label="Password">
        <UInput
          v-model="state.password"
          type="password"
          size="lg"
          autocomplete="current-password"
          class="w-full"
        />
      </UFormField>
      <UButton type="submit" size="lg" label="Sign in" block :loading="busy" class="mt-2" />
    </UForm>

    <p class="mt-8 text-sm text-muted">
      First machine?
      <ULink to="/setup" class="text-default font-medium">Run setup</ULink>
    </p>
  </div>
</template>
