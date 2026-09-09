<script setup lang="ts">
import type { CommunityStats } from '~~/shared/telemetry'

const stats = ref<CommunityStats | null>(null)

onMounted(async () => {
  try {
    stats.value = await $fetch<CommunityStats>('/api/community-stats')
  }
  catch {
    stats.value = null
  }
})

const cards = computed(() => stats.value ? [
  { label: 'Workers installed', value: stats.value.installations },
  { label: 'D1 databases', value: stats.value.databases },
  { label: 'R2 buckets', value: stats.value.buckets },
  { label: 'domains connected', value: stats.value.domains },
  { label: 'active in 14 days', value: stats.value.activeInstallations },
] : [])
const number = new Intl.NumberFormat('en-US')
</script>

<template>
  <section v-if="stats?.available && stats.installations > 0" class="border-b border-muted py-14 sm:py-16">
    <UContainer>
      <div class="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div class="max-w-xl">
          <p class="text-sm font-medium text-primary">Running on Cloudflare</p>
          <h2 class="display-title mt-3 text-3xl font-semibold text-highlighted sm:text-4xl">Independent workspaces, real infrastructure.</h2>
          <p class="mt-3 text-sm leading-6 text-muted">Anonymous totals from guided installs. No workspace names, domains, people, messages, or files.</p>
        </div>
        <p class="text-sm text-muted">Updated from verified installs and authenticated weekly heartbeats</p>
      </div>
      <dl class="mt-9 grid overflow-hidden rounded-2xl border border-muted bg-muted sm:grid-cols-2 lg:grid-cols-5">
        <div v-for="card in cards" :key="card.label" class="border-b border-r border-default bg-default p-6 last:border-b-0 sm:last:border-b lg:border-b-0">
          <dd class="font-mono text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">{{ number.format(card.value) }}</dd>
          <dt class="mt-2 text-sm text-muted">{{ card.label }}</dt>
        </div>
      </dl>
    </UContainer>
  </section>
</template>
