<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
await navigateTo('/channels', { replace: true })
</script>

<template>
  <div />
</template>
