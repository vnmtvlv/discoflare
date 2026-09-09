<script setup lang="ts">
const rows = [
  { name: 'Northwind', stage: 'Trial', owner: 'Maya', tone: 'text-primary' },
  { name: 'Acme Co', stage: 'Renewal', owner: 'Alex', tone: 'text-toned' },
  { name: 'Vertex', stage: 'Onboarding', owner: 'Jun', tone: 'text-toned' },
]
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="mb-5 flex items-center justify-between border-b border-muted pb-4">
      <div class="flex items-center gap-2">
        <UIcon name="i-ph-table" class="text-muted" />
        <strong class="text-sm">Accounts</strong>
      </div>
      <span class="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">3 of 1,248</span>
    </div>

    <div class="flex flex-1 flex-col justify-center">
      <div class="grid grid-cols-[1.2fr_1fr_0.8fr] gap-2 border-b border-muted pb-2 text-[10px] font-medium uppercase tracking-wide text-dimmed">
        <span>Account</span>
        <span>Stage</span>
        <span>Owner</span>
      </div>
      <div
        v-for="row in rows"
        :key="row.name"
        class="grid grid-cols-[1.2fr_1fr_0.8fr] items-center gap-2 border-b border-muted/60 py-2.5 text-xs text-toned"
      >
        <span class="font-medium text-highlighted">{{ row.name }}</span>
        <span :class="row.tone">{{ row.stage }}</span>
        <span>{{ row.owner }}</span>
      </div>

      <div class="mt-4 flex items-center gap-2 text-xs text-muted">
        <UIcon name="i-ph-infinity" />
        No row limit, no per-editor fee.
      </div>
    </div>
  </div>
</template>
