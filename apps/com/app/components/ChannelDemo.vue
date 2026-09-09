<script setup lang="ts">
const results = [
  {
    when: 'Earlier',
    author: 'Member',
    message: 'The deployment checklist and rollback steps are attached to the release thread.',
    meta: '3 replies in thread',
  },
  {
    when: 'Today',
    author: 'Agent',
    message: 'Found the thread and linked the verification steps.',
    meta: 'In #operations',
  },
]
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="mb-5 flex items-center justify-between border-b border-muted pb-4">
      <div class="flex items-center gap-2">
        <UIcon name="i-ph-magnifying-glass" class="text-muted" />
        <strong class="text-sm">deployment checklist</strong>
      </div>
      <span class="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">2 matches</span>
    </div>

    <div class="flex flex-1 flex-col justify-center gap-3">
      <div v-for="result in results" :key="result.when" class="rounded-xl bg-muted p-3 text-xs leading-5 text-toned">
        <div class="mb-1.5 flex items-center justify-between gap-3">
          <span class="font-medium text-highlighted">{{ result.author }}</span>
          <span class="font-mono text-[10px] uppercase tracking-wide text-dimmed">{{ result.when }}</span>
        </div>
        {{ result.message }}
        <div class="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
          <UIcon name="i-ph-arrow-bend-down-right" class="size-3" />
          {{ result.meta }}
        </div>
      </div>

      <div class="flex items-center gap-2 text-xs text-muted">
        <UIcon name="i-ph-infinity" class="size-4 shrink-0 text-primary" />
        Workspace history stays searchable in your own database.
      </div>
    </div>
  </div>
</template>
