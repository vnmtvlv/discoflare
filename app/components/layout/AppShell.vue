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

watch(() => route.params.channel, () => {
  if (isMobile.value) ui.mobilePane = 'chat'
})
</script>

<template>
  <div class="h-dvh overflow-hidden flex bg-default">
    <aside
      v-if="workspaceId && (!isMobile || ui.mobilePane === 'channels')"
      class="w-60 shrink-0 bg-muted flex flex-col min-h-0"
      :class="isMobile ? 'absolute inset-y-0 start-0 z-30 shadow-xl' : ''"
    >
      <LayoutChannelNav :workspace-id="workspaceId" />
    </aside>
    <button
      v-if="isMobile && ui.mobilePane === 'channels'"
      type="button"
      class="absolute inset-0 z-20 bg-inverted/40"
      aria-label="Close channel list"
      @click="ui.mobilePane = 'chat'"
    />
    <div class="flex-1 min-w-0 min-h-0 flex flex-col">
      <slot />
    </div>
  </div>
</template>
