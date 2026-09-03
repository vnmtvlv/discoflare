<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
const route = useRoute()
const ui = useUiStore()
onMounted(() => {
  ui.threadId = String(route.params.threadId)
})
</script>

<template>
  <ChatConversationView />
</template>
