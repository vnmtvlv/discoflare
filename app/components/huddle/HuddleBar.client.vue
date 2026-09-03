<script setup lang="ts">
import type { ClientMsg, MemberDTO } from '~~/shared/types'

const props = defineProps<{
  channelId: string
  members: MemberDTO[]
  send: (msg: ClientMsg) => void
}>()

const huddle = useHuddleStore()
const { start, join, leave, toggleMute } = useHuddleSession(() => props.channelId, props.send)

const names = computed(() => {
  const map: Record<string, string> = {}
  for (const m of props.members) map[m.user.id] = m.nickname || m.user.displayName
  return map
})
</script>

<template>
  <div
    v-if="huddle.state?.active || huddle.connection === 'live'"
    class="mx-4 mb-2 rounded-lg bg-muted px-3 py-2 flex items-center gap-3"
  >
    <UIcon name="i-ph-speaker-high" class="size-4 text-success shrink-0" />
    <div class="min-w-0 flex-1">
      <p class="text-xs font-semibold text-success">Voice Connected</p>
      <UAvatarGroup size="3xs" class="mt-1">
        <UAvatar
          v-for="id in huddle.state?.participantIds ?? []"
          :key="id"
          :text="(names[id] || '?').slice(0, 1).toUpperCase()"
          :alt="names[id]"
        />
      </UAvatarGroup>
    </div>
    <div class="flex items-center gap-1">
      <UButton
        v-if="!huddle.state?.active"
        size="xs"
        icon="i-ph-phone"
        label="Start"
        @click="start"
      />
      <template v-else>
        <UButton v-if="huddle.connection !== 'live'" size="xs" icon="i-ph-phone" label="Join" @click="join" />
        <UButton
          v-if="huddle.connection === 'live'"
          size="xs"
          color="neutral"
          variant="ghost"
          square
          :icon="huddle.muted ? 'i-ph-microphone-slash' : 'i-ph-microphone'"
          :aria-label="huddle.muted ? 'Unmute' : 'Mute'"
          @click="toggleMute"
        />
        <UButton v-if="huddle.connection === 'live'" size="xs" color="error" variant="soft" label="Disconnect" @click="leave" />
      </template>
    </div>
    <UAlert v-if="huddle.error" color="error" :title="huddle.error" class="max-w-xs" />
  </div>
</template>
