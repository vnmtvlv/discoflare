<script setup lang="ts">
const ui = useUiStore()
</script>

<template>
  <UModal v-model:open="ui.huddleSetupOpen" title="Huddles need RealtimeKit">
    <template #body>
      <p class="text-sm text-muted">The workspace owner can configure it in Workspace Settings → Huddles.</p>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" label="Close" @click="ui.huddleSetupOpen = false" />
    </template>
  </UModal>
</template>
