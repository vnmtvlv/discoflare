<script setup lang="ts">
const session = useSessionStore()
const presence = usePresenceStore()
const huddle = useHuddleStore()

const settingsOpen = ref(false)

const status = computed(() => {
  const id = session.user?.id
  return id ? presence.statusOf(id) : 'offline'
})

const chipColor = computed(() => {
  if (status.value === 'online') return 'success' as const
  if (status.value === 'idle') return 'warning' as const
  return 'neutral' as const
})

const statusLabel = computed(() => {
  if (huddle.connection === 'live') return huddle.muted ? 'Muted' : 'Voice Connected'
  if (status.value === 'online') return 'Online'
  if (status.value === 'idle') return 'Idle'
  return 'Offline'
})

</script>

<template>
  <div class="px-2 pt-2 pb-6 shrink-0">
    <div class="df-panel flex h-11 items-center gap-0.5 rounded-lg px-1">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-start hover:bg-elevated/80 focus-visible:outline-2 focus-visible:outline-primary"
        @click="settingsOpen = true"
      >
        <UChip inset :color="chipColor" position="bottom-right" size="sm">
          <UAvatar
            size="sm"
            :text="(session.user?.displayName || '?').slice(0, 1).toUpperCase()"
            :alt="session.user?.displayName"
          />
        </UChip>
        <span class="min-w-0 flex-1 leading-tight">
          <span class="block text-sm font-semibold text-highlighted truncate">{{ session.user?.displayName }}</span>
          <span class="block text-[11px] text-muted truncate">{{ statusLabel }}</span>
        </span>
      </button>
      <UTooltip :text="huddle.muted ? 'Unmute' : 'Mute'">
        <UButton
          :icon="huddle.muted ? 'i-ph-microphone-slash' : 'i-ph-microphone'"
          :color="huddle.muted ? 'error' : 'neutral'"
          variant="ghost"
          size="sm"
          square
          :aria-pressed="huddle.muted"
          :aria-label="huddle.muted ? 'Unmute' : 'Mute'"
          @click="huddle.toggleMute()"
        />
      </UTooltip>
      <UTooltip :text="huddle.deafened ? 'Undeafen' : 'Deafen'">
        <UButton
          :icon="huddle.deafened ? 'i-ph-speaker-slash' : 'i-ph-headphones'"
          :color="huddle.deafened ? 'error' : 'neutral'"
          variant="ghost"
          size="sm"
          square
          :aria-pressed="huddle.deafened"
          :aria-label="huddle.deafened ? 'Undeafen' : 'Deafen'"
          @click="huddle.toggleDeafen()"
        />
      </UTooltip>
      <UTooltip text="User settings">
        <UButton
          icon="i-ph-gear"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          aria-label="User settings"
          @click="settingsOpen = true"
        />
      </UTooltip>

      <SettingsUserSettings v-model:open="settingsOpen" />
    </div>
  </div>
</template>
