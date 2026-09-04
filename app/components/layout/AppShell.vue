<script setup lang="ts">
const ui = useUiStore()
const props = defineProps<{
  workspaceId?: string
}>()
const route = useRoute()
const { workspaceId: defaultWorkspaceId } = useWorkspace()

const { width } = useWindowSize()
const isMobile = computed(() => width.value > 0 && width.value < 768)
const workspaceId = computed(() => props.workspaceId || defaultWorkspaceId.value || ui.last()?.workspaceId)

watch(() => route.fullPath, () => {
  if (isMobile.value) ui.mobilePane = 'chat'
})
</script>

<template>
  <div class="relative flex h-full overflow-hidden bg-default">
    <aside
      v-if="workspaceId && (!isMobile || ui.mobilePane === 'channels')"
      id="channel-navigation"
      class="relative flex min-h-0 shrink-0 flex-col bg-muted pb-[var(--df-safe-area-bottom)] pt-[var(--df-safe-area-top)]"
      :class="isMobile ? 'absolute inset-y-0 start-0 z-30 shadow-xl w-60' : ''"
      :style="!isMobile ? { width: `${ui.channelPaneWidth}px` } : undefined"
    >
      <LayoutChannelNav :workspace-id="workspaceId" />
      <LayoutResizeHandle
        v-if="!isMobile"
        v-model="ui.channelPaneWidth"
        :min="200"
        :max="360"
        side="end"
        label="Resize channel panel"
      />
    </aside>
    <button
      v-if="isMobile && ui.mobilePane === 'channels'"
      type="button"
      class="absolute inset-0 z-20 bg-inverted/40"
      aria-label="Close channel list"
      @click="ui.mobilePane = 'chat'"
    />
    <div class="flex min-h-0 min-w-0 flex-1 flex-col pb-[var(--df-safe-area-bottom)] pt-[var(--df-safe-area-top)]">
      <slot />
    </div>
  </div>
</template>
