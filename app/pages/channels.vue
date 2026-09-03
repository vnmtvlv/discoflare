<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
const { guildId } = useWorkspace()
</script>

<template>
  <LayoutAppShell :guild-id="guildId || undefined">
    <NuxtPage />
  </LayoutAppShell>
</template>
