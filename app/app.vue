<script setup lang="ts">
const url = useRequestURL()
const image = `${url.origin}/og-image.png`

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
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

