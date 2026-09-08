<script setup lang="ts">
import type { ClientMsg, MemberDTO } from '~~/shared/types'

const props = defineProps<{
  channelId: string
  members: MemberDTO[]
  send: (msg: ClientMsg) => void
}>()

const emit = defineEmits<{
  start: []
  join: []
}>()

const huddle = useHuddleStore()
const { leave } = useHuddleSession(() => props.channelId, props.send, { leaveOnUnmount: false })
const state = computed(() => huddle.stateFor(props.channelId))
const joinedHere = computed(() => huddle.connection === 'live' && huddle.currentChannelId === props.channelId)
const names = computed(() => Object.fromEntries(props.members.map(member => [member.user.id, member.nickname || member.user.displayName])))
const users = computed(() => Object.fromEntries(props.members.map(member => [member.user.id, member.user])))
</script>

<template>
  <div class="mx-4 mb-2 flex items-center gap-3 rounded-lg border border-success/20 bg-success/5 px-3 py-2">
    <UIcon :name="state?.kind === 'call' ? 'i-ph-phone' : 'i-ph-waveform'" class="size-4 shrink-0 text-success" />
    <div class="min-w-0 flex-1">
      <p class="truncate text-xs font-semibold text-success">
        {{ joinedHere ? 'Connected' : state?.kind === 'call' ? 'Call in progress' : 'Huddle in progress' }}
      </p>
      <p v-if="state?.title" class="truncate text-[11px] text-muted">{{ state.title }}</p>
      <UAvatarGroup v-if="state?.participantIds.length" size="3xs" class="mt-1">
        <UAvatar
          v-for="id in state.participantIds"
          :key="id"
          :src="users[id] ? userAvatarSrc(users[id]!) : undefined"
          :text="(names[id] || '?').slice(0, 1).toUpperCase()"
          :alt="names[id]"
        />
      </UAvatarGroup>
    </div>
    <div class="flex items-center gap-1">
      <template v-if="joinedHere">
        <UButton color="neutral" variant="ghost" size="xs" square icon="i-ph-corners-out" aria-label="Open huddle" @click="huddle.expanded = true" />
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          square
          :icon="huddle.muted ? 'i-ph-microphone-slash' : 'i-ph-microphone'"
          :aria-label="huddle.muted ? 'Unmute' : 'Mute'"
          @click="huddle.toggleMute()"
        />
        <UButton color="error" variant="soft" size="xs" icon="i-ph-phone-disconnect" label="Leave" @click="leave" />
      </template>
      <UButton v-else-if="state?.active" size="xs" icon="i-ph-phone" label="Join" @click="emit('join')" />
      <UButton v-else size="xs" icon="i-ph-phone" label="Start" @click="emit('start')" />
    </div>
    <UAlert v-if="huddle.error && joinedHere" color="error" :title="huddle.error" class="max-w-xs" />
  </div>
</template>
