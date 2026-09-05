<script setup lang="ts">
const { workspaceId } = useWorkspace()
</script>

<template>
  <LayoutAppShell :workspace-id="workspaceId || undefined">
    <slot />
    <DataCreateDialogs />
  </LayoutAppShell>
</template>
