<script setup lang="ts">
import type { RightPanelTab } from '~~/shared/types'

const model = defineModel<RightPanelTab>({ required: true })

const tabs: Array<{ value: RightPanelTab; label: string }> = [
  { value: 'members', label: 'Members' },
  { value: 'threads', label: 'Threads' },
  { value: 'files', label: 'Files' },
]
</script>

<template>
  <div role="tablist" aria-label="Right panel views" class="flex min-w-0 items-center gap-0.5">
    <UButton
      v-for="tab in tabs"
      :key="tab.value"
      :label="tab.label"
      size="xs"
      color="neutral"
      :variant="model === tab.value ? 'soft' : 'ghost'"
      role="tab"
      :aria-selected="model === tab.value"
      @click="model = tab.value"
    />
  </div>
</template>
