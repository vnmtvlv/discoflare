<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
const route = useRoute()
const ui = useUiStore()

// The URL owns which thread is open, so navigating between thread links
// (for example from the navigation) switches threads in place.
watch(() => [route.params.channel, route.params.threadId] as const, ([channel, threadId]) => {
  if (!threadId) return
  ui.threadId = String(threadId)
  ui.threadParentId = String(channel)
  ui.rightPanelOpen = true
  ui.rightPanelTab = 'threads'
}, { immediate: true })
</script>

<template>
  <ChatConversationView />
</template>
