<script setup lang="ts">
import { ACCOUNT_PROVIDERS, type AccountAuthSettings } from '~~/shared/account-auth'

const session = useSessionStore()
const toast = useToast()
const route = useRoute()
const settings = ref<AccountAuthSettings | null>(null)
const loading = ref(true)
const error = ref('')
const busy = ref('')
const email = ref('')
const emailSent = ref(false)
const password = reactive({ current: '', next: '', confirm: '' })
const hasPassword = computed(() => settings.value?.accounts.some(account => account.provider === 'credential'))

async function load() {
  loading.value = true
  error.value = ''
  try { settings.value = await $fetch<AccountAuthSettings>('/api/auth/accounts') }
  catch (cause) { error.value = errorMessage(cause) }
  finally { loading.value = false }
}

async function act(action: string, body: object) {
  busy.value = action
  error.value = ''
  try {
    const result = await $fetch<{ url?: string }>('/api/auth/account', { method: 'POST', body })
    if (result.url) { await navigateTo(result.url, { external: true }); return }
    if (action === 'email') emailSent.value = true
    else {
      await load()
      await session.refresh()
      toast.add({ title: 'Login methods updated', color: 'success' })
    }
  }
  catch (cause) { error.value = errorMessage(cause) }
  finally { busy.value = '' }
}

async function savePassword() {
  if (password.next.length < 8 || password.next !== password.confirm) { error.value = 'Use at least 8 characters and confirm the same password.'; return }
  if (!hasPassword.value) {
    await act('password', { action: 'password', password: password.next })
  }
  else {
    busy.value = 'password'
    error.value = ''
    try {
      await $fetch('/api/auth/change-password', { method: 'POST', body: { currentPassword: password.current, newPassword: password.next, revokeOtherSessions: true } })
      toast.add({ title: 'Password updated', color: 'success' })
    }
    catch (cause) { error.value = errorMessage(cause) }
    finally { busy.value = '' }
  }
  if (!error.value) Object.assign(password, { current: '', next: '', confirm: '' })
}

onMounted(async () => {
  await load()
  if (route.query.link === 'failed' || route.query.error) error.value = 'The account could not be connected. It may already belong to another member. Sign in again and retry.'
})
</script>

<template>
  <section class="mt-8 max-w-xl space-y-5" aria-label="Login methods">
    <h2 class="text-sm font-semibold text-highlighted">Login methods</h2>
    <LayoutSkeleton v-if="loading" variant="form" />
    <UAlert v-if="error" color="error" variant="subtle" title="Account change stopped" :description="error" />
    <UButton v-if="!settings && !loading" label="Retry" @click="load" />
    <UAlert v-if="settings?.managed" color="neutral" variant="subtle" title="Managed by Cloudflare Access" description="Your operator manages sign-in in Cloudflare Access." />
    <template v-else-if="settings">
      <p class="text-sm text-muted">Connect another way to sign in to this same member account. Your messages and role stay with you.</p>
      <div class="divide-y divide-default rounded-lg bg-elevated px-4">
        <template v-for="provider in ACCOUNT_PROVIDERS" :key="provider.id">
          <div v-if="settings.methods[provider.id] || settings.accounts.some(account => account.provider === provider.id)" class="flex flex-wrap items-center justify-between gap-3 py-3">
            <div class="flex items-center gap-2"><UIcon :name="provider.icon" /><span>{{ provider.label }}</span></div>
            <template v-if="settings.accounts.some(account => account.provider === provider.id)">
              <div v-for="account in settings.accounts.filter(item => item.provider === provider.id)" :key="account.id" class="flex items-center gap-2">
                <UBadge :label="account.enabled ? 'Connected' : 'Disabled by owner'" color="neutral" variant="subtle" />
                <UButton label="Disconnect" size="xs" color="neutral" variant="ghost" :disabled="!account.canRemove || Boolean(busy)" :loading="busy === account.id" @click="act(account.id, { action: 'unlink', accountId: account.id })" />
              </div>
            </template>
            <UButton v-else label="Connect" size="sm" color="neutral" variant="outline" :disabled="Boolean(busy)" :loading="busy === provider.id" @click="act(provider.id, { action: 'link', provider: provider.id })" />
          </div>
        </template>
      </div>
      <p class="text-xs text-muted">Keep at least one available login method. Account changes require a recent sign-in.</p>
      <form v-if="settings.canAddEmail" class="space-y-3" @submit.prevent="act('email', { action: 'email', email })">
        <UFormField :label="settings.email ? 'Change email' : 'Add email'" description="Verify the new address to attach it to this account.">
          <UInput v-model="email" type="email" autocomplete="email" required class="w-full" placeholder="you@example.com" />
        </UFormField>
        <UButton type="submit" label="Send verification email" :loading="busy === 'email'" :disabled="Boolean(busy) || !email.trim()" />
        <UAlert v-if="emailSent" color="success" variant="subtle" title="Check your email" description="Follow the verification link. Your account keeps its existing login methods." />
      </form>
      <p v-else class="text-sm text-muted">The workspace owner must configure email delivery before you can add or change an email.</p>
      <form v-if="hasPassword || settings.canSetPassword" class="space-y-3" @submit.prevent="savePassword">
        <h3 class="text-sm font-semibold text-highlighted">{{ hasPassword ? 'Change password' : 'Set a password' }}</h3>
        <UFormField v-if="hasPassword" label="Current password"><FormPasswordInput v-model="password.current" autocomplete="current-password" /></UFormField>
        <UFormField label="New password" hint="At least 8 characters"><FormPasswordInput v-model="password.next" autocomplete="new-password" /></UFormField>
        <UFormField label="Confirm password"><FormPasswordInput v-model="password.confirm" autocomplete="new-password" /></UFormField>
        <UButton type="submit" :label="hasPassword ? 'Change password' : 'Set password'" :loading="busy === 'password'" :disabled="Boolean(busy) || password.next.length < 8 || password.next !== password.confirm || Boolean(hasPassword && !password.current)" />
      </form>
      <p v-else-if="settings.methods.email" class="text-sm text-muted">Add and verify an email address before setting a password.</p>
    </template>
  </section>
</template>
