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
    <Transition name="channel-drawer" :css="isMobile">
      <aside
        v-if="workspaceId && (!isMobile || ui.mobilePane === 'channels')"
        id="channel-navigation"
        class="flex min-h-0 shrink-0 flex-col bg-muted pb-[var(--df-safe-area-bottom)] pt-[var(--df-safe-area-top)]"
        :class="isMobile ? 'absolute inset-y-0 start-0 z-30 w-60 shadow-xl' : 'relative'"
        :style="!isMobile ? { width: `${ui.channelPaneWidth}px` } : undefined"
      >
        <LayoutNavShell :workspace-id="workspaceId" />
        <LayoutResizeHandle
          v-if="!isMobile"
          v-model="ui.channelPaneWidth"
          :min="200"
          :max="360"
          side="end"
          label="Resize channel panel"
        />
      </aside>
    </Transition>
    <Transition name="channel-backdrop" :css="isMobile">
      <button
        v-if="isMobile && ui.mobilePane === 'channels'"
        type="button"
        class="absolute inset-0 z-20 bg-inverted/40"
        aria-label="Close channel list"
        @click="ui.mobilePane = 'chat'"
      />
    </Transition>
    <div class="flex min-h-0 min-w-0 flex-1 flex-col pb-[var(--df-safe-area-bottom)] pt-[var(--df-safe-area-top)]">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.channel-drawer-enter-active {
  transition: transform 220ms cubic-bezier(0.32, 0.72, 0, 1);
}

.channel-drawer-leave-active {
  transition: transform 180ms ease-in;
}

.channel-drawer-enter-from,
.channel-drawer-leave-to {
  transform: translateX(-100%);
}

.channel-backdrop-enter-active,
.channel-backdrop-leave-active {
  transition: opacity 180ms ease;
}

.channel-backdrop-enter-from,
.channel-backdrop-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .channel-drawer-enter-active,
  .channel-drawer-leave-active,
  .channel-backdrop-enter-active,
  .channel-backdrop-leave-active {
    transition-duration: 1ms;
  }
}
</style>
