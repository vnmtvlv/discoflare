<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
const { workspaceId } = useWorkspace()
const open = ref(true)
watch(open, (v) => {
  if (!v) void navigateTo('/channels')
})
</script>

<template>
  <SettingsWorkspaceSettings v-model:open="open" :workspace-id="workspaceId" />
</template>
