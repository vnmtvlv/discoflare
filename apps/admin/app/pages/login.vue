<script setup lang="ts">
const loginUrl = shallowRef('')
const loading = shallowRef(true)
const error = shallowRef('')

function errorMessage(cause: unknown) {
  if (cause && typeof cause === 'object') {
    const value = cause as { data?: { message?: string }, message?: string }
    return value.data?.message || value.message || 'Cloudflare login failed'
  }
  return 'Cloudflare login failed'
}

onMounted(async () => {
  try {
    const fragment = new URLSearchParams(window.location.hash.slice(1))
    const accessToken = fragment.get('token')?.trim() || ''
    if (accessToken) {
      window.history.replaceState({}, '', window.location.pathname)
      await $fetch('/api/auth/cloudflare', { method: 'POST', body: { accessToken } })
      await navigateTo('/')
      return
    }
    const response = await $fetch<{ url: string }>('/api/auth/login')
    loginUrl.value = response.url
  }
  catch (cause) {
    error.value = errorMessage(cause)
  }
  finally {
    loading.value = false
  }
})

useSeoMeta({
  title: 'Sign in · Discoflare Admin',
  description: 'Sign in to Discoflare Admin with Cloudflare.',
  robots: 'noindex, nofollow',
})
</script>

<template>
  <main class="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
    <div class="noise-grid pointer-events-none absolute inset-0" />
    <UCard class="relative w-full max-w-md" :ui="{ body: 'p-7 sm:p-9' }">
      <AdminBrand />
      <h1 class="mt-8 text-2xl font-semibold tracking-tight text-highlighted">Sign in to Admin</h1>
      <p class="mt-2 text-sm leading-6 text-muted">Use the Cloudflare identity that installed this account control plane.</p>
      <UAlert v-if="error" class="mt-6" color="error" variant="subtle" title="Sign-in stopped" :description="error" />
      <div v-if="loading" class="mt-7 flex items-center gap-3 text-sm text-muted">
        <UIcon name="i-ph-spinner-gap" class="size-5 animate-spin" />
        Finishing sign-in
      </div>
      <UButton
        v-else-if="loginUrl"
        class="mt-7"
        :to="loginUrl"
        external
        block
        size="lg"
        label="Continue with Cloudflare"
        trailing-icon="i-ph-arrow-right"
      />
    </UCard>
  </main>
</template>
