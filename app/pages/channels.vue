<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
const { workspaceId } = useWorkspace()
</script>

<template>
  <LayoutAppShell :workspace-id="workspaceId || undefined">
    <NuxtPage />
  </LayoutAppShell>
</template>
