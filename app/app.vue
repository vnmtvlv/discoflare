<script setup lang="ts">
const url = useRequestURL()
const image = `${url.origin}/og-image.png`
const { native } = useClientServers()

useSeoMeta({
  ogTitle: 'Discoflare',
  ogDescription: 'Chat that lives on your Cloudflare account.',
  ogImage: image,
  twitterCard: 'summary_large_image',
  twitterTitle: 'Discoflare',
  twitterDescription: 'Chat that lives on your Cloudflare account.',
  twitterImage: image,
})
</script>

<template>
  <UApp>
    <NuxtRouteAnnouncer />
    <div v-if="native" class="flex h-dvh min-w-0 overflow-hidden bg-default">
      <ClientServerRail />
      <div class="min-w-0 flex-1 overflow-hidden">
        <NuxtLayout>
          <NuxtPage />
        </NuxtLayout>
      </div>
    </div>
    <NuxtLayout v-else>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
