<script setup lang="ts">
/** Title row for a settings pane; `back` turns it into a detail view header. */
defineProps<{
  title: string
  description?: string
  back?: string
}>()
defineEmits<{ back: [] }>()
</script>

<template>
  <div>
    <button
      v-if="back"
      type="button"
      class="mb-3 inline-flex items-center gap-1 rounded text-sm text-muted hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
      @click="$emit('back')"
    >
      <UIcon name="i-ph-caret-left" class="size-4" />
      {{ back }}
    </button>
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-2">
          <h1 class="truncate text-xl font-semibold text-highlighted">{{ title }}</h1>
          <slot name="badge" />
        </div>
        <p v-if="description" class="mt-1 text-sm text-muted">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>
