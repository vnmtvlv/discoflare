<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
const open = ref(true)
watch(open, (v) => {
  if (!v) void navigateTo('/')
})
</script>

<template>
  <LayoutAppShell>
    <SettingsUserSettings v-model:open="open" />
  </LayoutAppShell>
</template>
