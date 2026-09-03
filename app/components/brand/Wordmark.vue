<script setup lang="ts">
const props = withDefaults(defineProps<{
  compact?: boolean
  size?: 'sm' | 'md' | 'lg'
}>(), {
  compact: false,
  size: 'md',
})

const variant = computed(() => props.compact ? 'sm' : props.size)

const logoSize = computed(() => {
  if (variant.value === 'sm') return 'sm' as const
  if (variant.value === 'lg') return 'xl' as const
  return 'lg' as const
})

const textClass = computed(() => {
  if (variant.value === 'sm') return 'text-sm'
  if (variant.value === 'lg') return 'text-xl'
  return 'text-lg'
})

const gapClass = computed(() => {
  if (variant.value === 'sm') return 'gap-2'
  if (variant.value === 'lg') return 'gap-3'
  return 'gap-2.5'
})
</script>

<template>
  <div class="flex items-center" :class="gapClass">
    <BrandLogo :size="logoSize" alt="" :priority="variant !== 'sm'" />
    <span class="font-medium tracking-tight text-highlighted" :class="textClass">Discoflare</span>
  </div>
</template>
