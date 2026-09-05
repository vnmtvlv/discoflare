<script setup lang="ts">
const props = withDefaults(defineProps<{
  to?: string
  active?: boolean
  /** Renders bolder, for rows with unread activity that are not the active row. */
  unread?: boolean
  /** An ancestor of the active row: gets an accent bar instead of a second highlight. */
  ancestor?: boolean
}>(), { to: undefined, active: false, unread: false, ancestor: false })

const tone = computed(() => {
  if (props.active) return 'bg-accented text-highlighted'
  if (props.unread || props.ancestor) return 'text-highlighted font-medium hover:bg-elevated/80'
  return 'text-muted hover:bg-elevated/80 hover:text-default'
})
</script>

<template>
  <component
    :is="to ? resolveComponent('NuxtLink') : 'button'"
    :to="to"
    :type="to ? undefined : 'button'"
    class="relative flex h-11 w-full items-center gap-1.5 rounded-md px-2 text-start text-[15px] md:h-8"
    :class="tone"
    :aria-current="active ? 'page' : undefined"
  >
    <span v-if="ancestor" class="absolute -start-[9px] top-1 bottom-1 w-0.5 rounded-none bg-primary" aria-hidden="true" />
    <slot name="leading" />
    <span class="min-w-0 flex-1 truncate"><slot /></span>
    <slot name="trailing" />
  </component>
</template>
