<script setup lang="ts">
const steps = [
  { label: 'Configuration snapshotted', icon: 'i-ph-check-circle', tone: 'text-primary' },
  { label: 'Running tools in Agent Computer', icon: 'i-ph-spinner-gap', tone: 'text-primary' },
  { label: 'Review', icon: 'i-ph-circle-dashed', tone: 'text-dimmed' },
]
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="mb-5 flex items-center justify-between border-b border-muted pb-4">
      <div class="flex items-center gap-2">
        <UIcon name="i-ph-list-checks" class="text-muted" />
        <strong class="text-sm">Update the changelog</strong>
      </div>
      <span class="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Run 04</span>
    </div>

    <div class="flex flex-1 flex-col justify-center gap-3">
      <div v-for="step in steps" :key="step.label" class="flex items-center gap-2.5 text-xs leading-5 text-toned">
        <UIcon :name="step.icon" :class="step.tone" class="size-4 shrink-0" />
        {{ step.label }}
      </div>

      <div class="mt-1 flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2.5 text-xs leading-5 text-toned">
        <UIcon name="i-ph-shield-check" class="mt-0.5 size-4 shrink-0 text-primary" />
      Run state is durable and can be cancelled while active.
      </div>
    </div>
  </div>
</template>
