<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
const { guildId } = useWorkspace()
const open = ref(true)
watch(open, (v) => {
  if (!v) void navigateTo('/channels')
})
</script>

<template>
  <SettingsServerSettings v-model:open="open" :guild-id="guildId" />
</template>
