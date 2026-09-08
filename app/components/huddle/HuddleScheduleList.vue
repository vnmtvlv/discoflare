<script setup lang="ts">
import type { ScheduledHuddleDTO } from '~~/shared/types'

defineProps<{
  huddles: ScheduledHuddleDTO[]
  currentUserId?: string
  canManage: boolean
  kind: 'call' | 'huddle'
}>()

const emit = defineEmits<{
  join: [huddle: ScheduledHuddleDTO]
  cancel: [huddle: ScheduledHuddleDTO]
}>()

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

function timeLabel(value: string) {
  const date = new Date(value)
  const deltaMinutes = Math.round((date.getTime() - Date.now()) / 60_000)
  const relativeLabel = Math.abs(deltaMinutes) < 90
    ? relative.format(deltaMinutes, 'minute')
    : relative.format(Math.round(deltaMinutes / 60), 'hour')
  return `${date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · ${relativeLabel}`
}
</script>

<template>
  <div v-if="huddles.length" class="shrink-0 border-b border-default bg-elevated/40 px-3 py-2">
    <div
      v-for="item in huddles"
      :key="item.id"
      class="flex min-w-0 items-center gap-3 rounded-lg px-2 py-1.5"
    >
      <div class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <UIcon :name="item.status === 'ready' ? 'i-ph-waveform' : 'i-ph-calendar-blank'" class="size-4" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium text-highlighted">{{ item.title || `Scheduled ${kind}` }}</p>
        <p class="truncate text-xs text-muted">{{ item.status === 'ready' ? 'Ready to start' : timeLabel(item.startsAt) }}</p>
      </div>
      <UButton
        v-if="item.status === 'ready'"
        size="xs"
        icon="i-ph-phone"
        label="Start"
        @click="emit('join', item)"
      />
      <UDropdownMenu
        v-if="canManage || item.createdBy.id === currentUserId"
        :items="[[{ label: 'Cancel', icon: 'i-ph-x', color: 'error', onSelect: () => emit('cancel', item) }]]"
      >
        <UButton color="neutral" variant="ghost" size="xs" square icon="i-ph-dots-three" aria-label="Scheduled huddle actions" />
      </UDropdownMenu>
    </div>
  </div>
</template>
