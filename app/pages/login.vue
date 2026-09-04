<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { AuthLoginMethod, PublicAuthConfig } from '~~/shared/types'

definePageMeta({ layout: 'auth', middleware: ['guest'] })

const session = useSessionStore()
const route = useRoute()
const toast = useToast()
const busy = ref(false)
const socialBusy = ref<AuthLoginMethod | null>(null)
const error = ref<string | null>(null)
const { native, serverUrl } = useApi()
const { data: authConfig } = await useFetch<PublicAuthConfig>('/api/auth/config')

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
  if (route.query.verified === '1') toast.add({ title: 'Email verified. You can sign in.', color: 'success' })
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  busy.value = true
  error.value = null
  try {
    await session.login(event.data.email, event.data.password)
    await navigateTo(safeNextPath())
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

async function signInWith(provider: Exclude<AuthLoginMethod, 'email'>) {
  socialBusy.value = provider
  error.value = null
  try {
    const callbackURL = native
      ? serverUrl(safeNextPath())
      : new URL(safeNextPath(), window.location.origin).toString()
    const errorCallbackURL = native
      ? serverUrl('/login')
      : `${window.location.origin}/login`
    const res = await $fetch<{ url?: string | null }>('/api/auth/social', {
      method: 'POST',
      body: {
        provider,
        callbackURL,
        errorCallbackURL,
        inviteCode: inviteCode.value ?? undefined,
      },
    })
    if (!res.url) throw new Error('Sign-in did not return a redirect')
    window.location.assign(res.url)
  }
  catch (err) {
    error.value = errorMessage(err)
    toast.add({ title: error.value, color: 'error' })
    socialBusy.value = null
  }
}

const socialProviders = computed(() => [
  { id: 'github' as const, label: 'Continue with GitHub', icon: 'i-ph-github-logo' },
  { id: 'twitter' as const, label: 'Continue with X', icon: 'i-ph-x-logo' },
  { id: 'telegram' as const, label: 'Continue with Telegram', icon: 'i-ph-telegram-logo' },
].filter(provider => !native && authConfig.value?.methods[provider.id]))

const inviteCode = computed(() => {
  const next = typeof route.query.next === 'string' ? route.query.next : ''
  const match = next.match(/^\/invite\/([^/?#]+)/u)
  return match?.[1] ? decodeURIComponent(match[1]) : null
})

const signupPath = computed(() => inviteCode.value
  ? `/signup?invite=${encodeURIComponent(inviteCode.value)}`
  : '/signup')

const canCreateAccount = computed(() => Boolean(!native && authConfig.value?.emailSignupEnabled
  && (authConfig.value.signupEnabled || inviteCode.value)))
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

    <template v-if="socialProviders.length">
      <UButton
        v-for="provider in socialProviders"
        :key="provider.id"
        class="mt-3 first:mt-8"
        size="lg"
        color="neutral"
        variant="outline"
        :icon="provider.icon"
        :label="provider.label"
        block
        :loading="socialBusy === provider.id"
        :disabled="Boolean(socialBusy)"
        @click="signInWith(provider.id)"
      />
      <USeparator label="or" class="my-6" />
    </template>

    <UForm v-if="authConfig?.methods.email" :schema="schema" :state="state" :class="socialProviders.length ? 'space-y-4' : 'mt-8 space-y-4'" @submit="onSubmit">
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

    <p v-if="canCreateAccount" class="mt-8 text-sm text-muted">
      New here?
      <ULink :to="signupPath" class="text-default font-medium">Create account</ULink>
    </p>

    <p v-if="session.health?.users === 0" class="mt-8 text-sm text-muted">
      First machine?
      <ULink to="/setup" class="text-default font-medium">Run setup</ULink>
    </p>
  </div>
</template>
