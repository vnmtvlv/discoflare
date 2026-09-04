<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { PublicAuthConfig, SessionUser } from '~~/shared/types'

definePageMeta({ layout: 'auth', middleware: ['guest'] })

const route = useRoute()
const toast = useToast()
const session = useSessionStore()
const busy = ref(false)
const sent = ref(false)
const error = ref<string | null>(null)
const captchaToken = ref('')
const captchaKey = ref(0)
const { api, native } = useApi()
const inviteCode = computed(() => typeof route.query.invite === 'string' ? route.query.invite : undefined)
const { data: authConfig } = await useFetch<PublicAuthConfig>('/api/auth/config', {
  $fetch: native ? globalThis.$fetch : undefined,
})

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Use at least 8 characters'),
  confirm: z.string().min(8),
}).refine(value => value.password === value.confirm, { path: ['confirm'], message: 'Passwords do not match' })
type Schema = z.output<typeof schema>
const state = reactive<Partial<Schema>>({ name: '', email: '', password: '', confirm: '' })

const allowed = computed(() => Boolean(authConfig.value?.emailSignupEnabled
  && (authConfig.value.registrationMode === 'open' || inviteCode.value)))
const captchaRequired = computed(() => Boolean(authConfig.value?.turnstile.enabled && authConfig.value.turnstile.siteKey))

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (captchaRequired.value && !captchaToken.value) {
    error.value = 'Complete the security check'
    return
  }
  busy.value = true
  error.value = null
  try {
    const result = await api<{ ok: true, verificationRequired: boolean, user?: SessionUser }>('/api/auth/signup', {
      method: 'POST',
      headers: captchaToken.value ? { 'x-captcha-response': captchaToken.value } : undefined,
      body: {
        name: event.data.name,
        email: event.data.email,
        password: event.data.password,
        inviteCode: inviteCode.value,
      },
    })
    if (result.verificationRequired) {
      sent.value = true
    }
    else {
      session.user = result.user ?? null
      if (!session.user) await session.refresh(api)
      await navigateTo('/')
    }
  }
  catch (err) {
    error.value = errorMessage(err)
    toast.add({ title: error.value, color: 'error' })
    captchaToken.value = ''
    captchaKey.value += 1
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="text-xl font-medium tracking-tight text-highlighted">Create account</h1>

    <UAlert
      v-if="sent"
      color="success"
      variant="subtle"
      title="Check your email"
      description="Open the verification link, then sign in."
      class="mt-6"
    />
    <UAlert v-else-if="!allowed" color="warning" variant="subtle" title="Signup is not available" class="mt-6" />
    <template v-else>
      <UAlert v-if="error" color="error" variant="subtle" :title="error" class="mt-6" />
      <UForm :schema="schema" :state="state" class="mt-8 space-y-4" @submit="onSubmit">
        <UFormField name="name" label="Name">
          <UInput v-model="state.name" size="lg" autocomplete="name" class="w-full" />
        </UFormField>
        <UFormField name="email" label="Email">
          <UInput v-model="state.email" type="email" size="lg" autocomplete="email" class="w-full" />
        </UFormField>
        <UFormField name="password" label="Password">
          <UInput v-model="state.password" type="password" size="lg" autocomplete="new-password" class="w-full" />
        </UFormField>
        <UFormField name="confirm" label="Confirm password">
          <UInput v-model="state.confirm" type="password" size="lg" autocomplete="new-password" class="w-full" />
        </UFormField>
        <AuthTurnstileWidget
          v-if="authConfig?.turnstile.enabled && authConfig.turnstile.siteKey"
          :key="captchaKey"
          :site-key="authConfig.turnstile.siteKey"
          @update:model-value="captchaToken = $event"
        />
        <UButton type="submit" size="lg" label="Create account" block :loading="busy" :disabled="captchaRequired && !captchaToken" />
      </UForm>
    </template>

    <p class="mt-8 text-sm text-muted">
      Already have an account?
      <ULink :to="inviteCode ? `/login?next=/invite/${encodeURIComponent(inviteCode)}` : '/login'" class="text-default font-medium">Sign in</ULink>
    </p>
  </div>
</template>
