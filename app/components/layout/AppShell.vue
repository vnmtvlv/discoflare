<script setup lang="ts">
const ui = useUiStore()
const props = defineProps<{
  workspaceId?: string
}>()
const route = useRoute()
const { workspaceId: defaultWorkspaceId } = useWorkspace()

const isMobile = useIsMobile()
const workspaceId = computed(() => props.workspaceId || defaultWorkspaceId.value || ui.last()?.workspaceId)
const open = computed(() => ui.mobilePane === 'channels')

watch(() => route.fullPath, () => {
  if (isMobile.value) ui.mobilePane = 'chat'
})

// Swipe right anywhere to open the navigation drawer, swipe left to close it.
// The drawer follows the finger and settles by distance or flick velocity.
const drawer = ref<HTMLElement | null>(null)
const dragOffset = ref<number | null>(null)
let gesture: { x: number, y: number, t: number, width: number, axis: 'x' | 'y' | null, fromOpen: boolean } | null = null

const EDGE_PX = 24
const AXIS_LOCK_PX = 10

function scrollsHorizontally(target: EventTarget | null) {
  let node = target instanceof Element ? target : null
  while (node && node !== document.body) {
    if (node instanceof HTMLElement) {
      if (node.dataset.noDrawerSwipe !== undefined) return true
      if (node.scrollWidth > node.clientWidth + 1) {
        const overflow = getComputedStyle(node).overflowX
        if (overflow === 'auto' || overflow === 'scroll') return true
      }
    }
    node = node.parentElement
  }
  return false
}

function onTouchStart(event: TouchEvent) {
  if (!isMobile.value || !workspaceId.value || event.touches.length !== 1) return
  if (ui.mobilePane === 'members') return
  const touch = event.touches[0]!
  const target = event.target
  if (!open.value && touch.clientX > EDGE_PX && scrollsHorizontally(target)) return
  if (target instanceof Element && target.closest('input[type="range"], [role="slider"], [contenteditable="true"] *')) return
  gesture = {
    x: touch.clientX,
    y: touch.clientY,
    t: performance.now(),
    width: drawer.value?.offsetWidth || 300,
    axis: null,
    fromOpen: open.value,
  }
}

function onTouchMove(event: TouchEvent) {
  if (!gesture) return
  const touch = event.touches[0]!
  const dx = touch.clientX - gesture.x
  const dy = touch.clientY - gesture.y
  if (!gesture.axis) {
    if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
    gesture.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y'
    if (gesture.axis === 'y' || (gesture.fromOpen ? dx > 0 : dx < 0)) {
      gesture = null
      return
    }
  }
  const base = gesture.fromOpen ? gesture.width : 0
  dragOffset.value = Math.min(gesture.width, Math.max(0, base + dx))
}

function onTouchEnd(event: TouchEvent) {
  if (!gesture) return
  const current = gesture
  gesture = null
  if (dragOffset.value === null) return
  const dx = (event.changedTouches[0]?.clientX ?? current.x) - current.x
  const velocity = dx / Math.max(1, performance.now() - current.t)
  const shouldOpen = Math.abs(velocity) > 0.4
    ? velocity > 0
    : dragOffset.value > current.width / 2
  dragOffset.value = null
  ui.mobilePane = shouldOpen ? 'channels' : 'chat'
}

const drawerStyle = computed(() => {
  if (!isMobile.value) return { width: `${ui.channelPaneWidth}px` }
  if (dragOffset.value !== null) {
    return { transform: `translateX(calc(${dragOffset.value}px - 100%))`, transition: 'none' }
  }
  return { transform: open.value ? 'translateX(0)' : 'translateX(-100%)' }
})

const backdropOpacity = computed(() => {
  if (dragOffset.value !== null) return dragOffset.value / (drawer.value?.offsetWidth || 300)
  return open.value ? 1 : 0
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isMobile.value && open.value) ui.mobilePane = 'chat'
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div
    class="relative flex h-full overflow-hidden bg-default"
    @touchstart.passive="onTouchStart"
    @touchmove.passive="onTouchMove"
    @touchend.passive="onTouchEnd"
    @touchcancel.passive="onTouchEnd"
  >
    <aside
      v-if="workspaceId"
      id="channel-navigation"
      ref="drawer"
      class="flex min-h-0 shrink-0 flex-col bg-muted pb-[var(--df-safe-area-bottom)] pt-[var(--df-safe-area-top)]"
      :class="isMobile
        ? 'channel-drawer absolute inset-y-0 start-0 z-30 w-[min(22rem,86vw)] shadow-2xl'
        : 'relative'"
      :style="drawerStyle"
      :aria-hidden="isMobile && !open && dragOffset === null ? 'true' : undefined"
      :inert="isMobile && !open && dragOffset === null ? true : undefined"
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
    <button
      v-if="isMobile && workspaceId"
      type="button"
      class="channel-backdrop absolute inset-0 z-20 bg-black/60"
      :class="open || dragOffset !== null ? '' : 'pointer-events-none'"
      :style="{ opacity: backdropOpacity, transition: dragOffset !== null ? 'none' : undefined }"
      tabindex="-1"
      aria-label="Close navigation"
      @click="ui.mobilePane = 'chat'"
    />
    <div class="flex min-h-0 min-w-0 flex-1 flex-col pb-[var(--df-safe-area-bottom)] pt-[var(--df-safe-area-top)]">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.channel-drawer {
  transition: transform 260ms cubic-bezier(0.32, 0.72, 0, 1);
  will-change: transform;
}

.channel-backdrop {
  transition: opacity 220ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .channel-drawer,
  .channel-backdrop {
    transition-duration: 1ms;
  }
}
</style>
