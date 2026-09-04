<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'manage-workspace-settings'] })
const { workspaceId } = useWorkspace()
const open = ref(true)
watch(open, (v) => {
  if (!v) void navigateTo('/channels')
})
</script>

<template>
  <SettingsWorkspaceSettings v-model:open="open" :workspace-id="workspaceId" />
</template>
