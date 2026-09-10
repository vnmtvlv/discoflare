<script setup lang="ts">
import type { DeployProgress } from '../utils/deploy-progress'
import { deployProgressDetail, deployProgressPercent } from '../utils/deploy-progress'

defineProps<{
  event: DeployProgress | null
  title: string
}>()
</script>

<template>
  <div class="rounded-xl border border-default bg-elevated p-5">
    <p class="text-sm font-medium text-highlighted">{{ title }}</p>
    <div class="mt-4 flex items-center gap-3 text-sm text-muted">
      <UIcon name="i-ph-spinner-gap" class="size-5 shrink-0 animate-spin text-primary" />
      <span>{{ deployProgressDetail(event) }}</span>
    </div>
    <div class="mt-4 h-1.5 overflow-hidden rounded-full bg-default">
      <div
        class="h-full rounded-full bg-primary transition-all duration-300"
        :style="{ width: `${deployProgressPercent(event)}%` }"
      />
    </div>
    <p class="mt-3 text-xs text-muted">Keep this page open until Cloudflare finishes the Worker.</p>
  </div>
</template>
