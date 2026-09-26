<script setup lang="ts">
const ui = useUiStore()
const isMobile = useIsMobile()
</script>

<template>
  <UButton
    v-if="isMobile"
    icon="i-ph-list"
    color="neutral"
    variant="ghost"
    size="md"
    square
    class="-ms-1.5 size-10 shrink-0 justify-center"
    aria-label="Open navigation"
    aria-controls="channel-navigation"
    :aria-expanded="ui.mobilePane === 'channels'"
    @click="ui.mobilePane = 'channels'"
  />
</template>
