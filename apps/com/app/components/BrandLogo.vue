<script setup lang="ts">
withDefaults(defineProps<{
  linked?: boolean
}>(), {
  linked: true,
})
</script>

<template>
  <NuxtLink v-if="linked" to="/" class="inline-flex items-center gap-2.5" aria-label="Discoflare home">
    <img src="/brand/logo-128.png" alt="" class="size-8" width="32" height="32">
    <span class="text-highlighted text-lg font-semibold tracking-tight">Discoflare</span>
  </NuxtLink>
  <span v-else class="inline-flex items-center gap-2.5">
    <img src="/brand/logo-128.png" alt="" class="size-8" width="32" height="32">
    <span class="text-highlighted text-lg font-semibold tracking-tight">Discoflare</span>
  </span>
</template>
