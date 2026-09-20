<script setup lang="ts">
defineProps<{
  canEnd: boolean
}>()

const emit = defineEmits<{
  leave: []
  end: []
}>()

const huddle = useHuddleStore()
const participants = computed(() => [
  ...(huddle.selfParticipant ? [{ participant: huddle.selfParticipant, self: true }] : []),
  ...huddle.remoteParticipants.map(participant => ({ participant, self: false })),
])
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col bg-elevated/40">
    <header class="flex h-12 shrink-0 items-center gap-3 border-b border-default px-4">
      <div class="grid size-8 place-items-center rounded-lg bg-success/15 text-success">
        <UIcon :name="huddle.currentKind === 'call' ? 'i-ph-phone' : 'i-ph-waveform'" class="size-4" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-semibold text-highlighted">{{ huddle.currentTitle || 'Huddle' }}</p>
        <p class="text-xs text-muted">{{ participants.length }} {{ participants.length === 1 ? 'participant' : 'participants' }}</p>
      </div>
      <UButton icon="i-ph-corners-in" color="neutral" variant="ghost" square aria-label="Minimize live session" @click="huddle.expanded = false" />
    </header>

    <div class="grid min-h-0 flex-1 auto-rows-fr grid-cols-1 gap-2 overflow-y-auto p-3 sm:grid-cols-2 xl:grid-cols-3">
      <HuddleVideoTile
        v-for="item in participants"
        :key="item.self ? 'self' : item.participant.id"
        :participant="item.participant"
        :self="item.self"
        :active="!item.self && huddle.activeSpeakerId === item.participant.id"
        :revision="huddle.mediaRevision"
      />
    </div>

    <UAlert v-if="huddle.error" color="error" variant="subtle" class="mx-3 mb-2 shrink-0" title="Live connection problem" :description="huddle.error" />

    <footer class="flex shrink-0 items-center justify-center gap-2 border-t border-default bg-default/95 px-3 py-3">
      <UTooltip :text="huddle.muted ? 'Unmute' : 'Mute'">
        <UButton
          square
          size="lg"
          :icon="huddle.muted ? 'i-ph-microphone-slash' : 'i-ph-microphone'"
          :color="huddle.muted ? 'error' : 'neutral'"
          :variant="huddle.muted ? 'soft' : 'outline'"
          :aria-pressed="huddle.muted"
          @click="huddle.toggleMute()"
        />
      </UTooltip>
      <UTooltip :text="huddle.camera ? 'Turn camera off' : 'Turn camera on'">
        <UButton
          square
          size="lg"
          :icon="huddle.camera ? 'i-ph-video-camera' : 'i-ph-video-camera-slash'"
          :color="huddle.camera ? 'primary' : 'neutral'"
          :variant="huddle.camera ? 'soft' : 'outline'"
          :aria-pressed="huddle.camera"
          @click="huddle.toggleCamera()"
        />
      </UTooltip>
      <UTooltip :text="huddle.deafened ? 'Undeafen' : 'Deafen'">
        <UButton
          square
          size="lg"
          :icon="huddle.deafened ? 'i-ph-headphones-slash' : 'i-ph-headphones'"
          :color="huddle.deafened ? 'error' : 'neutral'"
          :variant="huddle.deafened ? 'soft' : 'outline'"
          :aria-pressed="huddle.deafened"
          @click="huddle.toggleDeafen()"
        />
      </UTooltip>
      <UTooltip :text="huddle.screenSharing ? 'Stop sharing' : 'Share screen'">
        <UButton
          square
          size="lg"
          icon="i-ph-monitor-arrow-up"
          :color="huddle.screenSharing ? 'primary' : 'neutral'"
          :variant="huddle.screenSharing ? 'soft' : 'outline'"
          :aria-pressed="huddle.screenSharing"
          @click="huddle.toggleScreenShare()"
        />
      </UTooltip>
      <UButton color="error" size="lg" icon="i-ph-phone-disconnect" label="Leave" @click="emit('leave')" />
      <UDropdownMenu
        v-if="canEnd"
        :items="[[{ label: 'End for everyone', icon: 'i-ph-x-circle', color: 'error', onSelect: () => emit('end') }]]"
      >
        <UButton color="neutral" variant="ghost" square icon="i-ph-dots-three-vertical" aria-label="Live session actions" />
      </UDropdownMenu>
    </footer>
  </section>
</template>
