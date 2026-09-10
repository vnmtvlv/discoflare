<script setup lang="ts">
const error = shallowRef('')

onMounted(async () => {
  try {
    const handoff = await $fetch<{
      origin: string
      accountId: string
      accessToken: string
      email: string
    }>('/api/cloudflare/admin-login')
    window.location.replace(`${handoff.origin}/login#token=${encodeURIComponent(handoff.accessToken)}`)
  }
  catch (cause) {
    error.value = cause && typeof cause === 'object' && 'data' in cause
      ? String((cause as { data?: { message?: string } }).data?.message || 'Cloudflare login failed')
      : 'Cloudflare login failed'
  }
})

useSeoMeta({
  title: 'Opening Discoflare Admin',
  robots: 'noindex, nofollow',
})
</script>

<template>
  <main class="flex min-h-screen items-center justify-center px-6">
    <div class="text-center">
      <UIcon v-if="!error" name="i-ph-spinner-gap" class="mx-auto size-6 animate-spin text-primary" />
      <h1 class="mt-4 text-lg font-semibold text-highlighted">Opening Discoflare Admin</h1>
      <p class="mt-2 text-sm text-muted">{{ error || 'Finishing Cloudflare login.' }}</p>
      <UButton v-if="error" class="mt-5" to="/deploy" label="Return to setup" />
    </div>
  </main>
</template>
