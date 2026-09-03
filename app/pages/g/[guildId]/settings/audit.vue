<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
const route = useRoute()
await navigateTo(`/g/${route.params.guildId}/settings`, { replace: true })
</script>

<template>
  <div />
</template>
