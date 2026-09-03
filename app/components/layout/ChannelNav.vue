<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { DropdownMenuItem } from '@nuxt/ui'
import type { ChannelDTO as Ch, GuildDTO as G, MemberDTO as M } from '~~/shared/types'
import { Permission } from '~~/shared/permissions'
import { channelPath } from '~~/shared/paths'
import { isVoiceType, normalizeChannelType } from '~~/shared/dm'
import { useClipboard } from '@vueuse/core'

const props = defineProps<{ guildId: string }>()
const route = useRoute()
const qc = useQueryClient()
const toast = useToast()
const huddle = useHuddleStore()
const { copy } = useClipboard()
const membersQ = useQuery({
  queryKey: computed(() => ['members', props.guildId]),
  queryFn: () => $fetch<{ members: M[] }>(`/api/guilds/${props.guildId}/members`),
})
const { can } = usePermissions(computed(() => membersQ.data.value?.members))

const guildQ = useQuery({
  queryKey: computed(() => ['guild', props.guildId]),
  queryFn: () => $fetch<{ guild: G }>(`/api/guilds/${props.guildId}`),
})
const channelsQ = useQuery({
  queryKey: computed(() => ['channels', props.guildId]),
  queryFn: () => $fetch<{ channels: Ch[] }>(`/api/guilds/${props.guildId}/channels`),
})
const guildsQ = useQuery({
  queryKey: ['guilds'],
  queryFn: () => $fetch<{ guilds: G[] }>('/api/guilds'),
})

const newName = ref('')
const newType = ref<'text' | 'voice'>('text')
const showCreate = ref(false)
const showInvite = ref(false)
const showServer = ref(false)
const inviteUrl = ref('')
const inviting = ref(false)
const creating = ref(false)
const collapsed = reactive({ text: false, voice: false })

const textChannels = computed(() => (channelsQ.data.value?.channels ?? []).filter((c) => normalizeChannelType(c.type) === 'text'))
const voiceChannels = computed(() => (channelsQ.data.value?.channels ?? []).filter((c) => isVoiceType(c.type)))
const selected = computed(() => String(route.params.channel || route.params.channelId || ''))
const guildName = computed(() => guildQ.data.value?.guild.name || '…')

const otherGuilds = computed(() => (guildsQ.data.value?.guilds ?? []).filter((g) => g.id !== props.guildId))

const serverItems = computed<DropdownMenuItem[][]>(() => {
  const invite: DropdownMenuItem[] = can(Permission.invite)
    ? [{ label: 'Invite People', icon: 'i-ph-user-plus', color: 'primary', onSelect: () => { showInvite.value = true } }]
    : []
  const manage: DropdownMenuItem[] = []
  if (can(Permission.manageChannels)) {
    manage.push({ label: 'Create Channel', icon: 'i-ph-hash', onSelect: () => { showCreate.value = true } })
  }
  manage.push({ label: 'Server Settings', icon: 'i-ph-gear', onSelect: () => { nextTick(() => { showServer.value = true }) } })
  const switcher: DropdownMenuItem[] = otherGuilds.value.map((g) => ({
    label: g.name,
    icon: 'i-ph-hard-drives',
    to: '/channels',
  }))
  return [invite, manage, switcher].filter((g) => g.length)
})

const channelTypes = [
  { label: 'Text', value: 'text', icon: 'i-ph-hash', description: 'Chat, images, GIFs' },
  { label: 'Voice', value: 'voice', icon: 'i-ph-speaker-high', description: 'Hang out together' },
]

function channelClass(ch: Ch) {
  const path = channelPath(ch)
  const active = selected.value === ch.id || route.path === path || route.path.startsWith(`${path}/`)
  if (active) return 'bg-accented text-highlighted'
  if (ch.unread) return 'text-highlighted font-semibold hover:bg-elevated/80'
  return 'text-muted hover:bg-elevated/80 hover:text-default'
}

async function createChannel() {
  if (!newName.value.trim()) return
  creating.value = true
  try {
    const res = await $fetch<{ channel: Ch }>(`/api/guilds/${props.guildId}/channels`, {
      method: 'POST',
      body: { name: newName.value.trim().toLowerCase().replace(/\s+/g, '-'), type: newType.value },
    })
    await qc.invalidateQueries({ queryKey: ['channels', props.guildId] })
    showCreate.value = false
    newName.value = ''
    await navigateTo(channelPath(res.channel))
  }
  finally {
    creating.value = false
  }
}

async function makeInvite() {
  inviting.value = true
  try {
    const res = await $fetch<{ invite: { code: string; url: string } }>(`/api/guilds/${props.guildId}/invites`, { method: 'POST', body: {} })
    inviteUrl.value = `${location.origin}${res.invite.url}`
  }
  catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
    showInvite.value = false
  }
  finally {
    inviting.value = false
  }
}

async function copyInvite() {
  if (!inviteUrl.value) return
  await copy(inviteUrl.value)
  toast.add({ title: 'Invite copied', color: 'success' })
}

watch(showInvite, (open) => {
  if (open) {
    inviteUrl.value = ''
    void makeInvite()
  }
})

watch(() => channelsQ.data.value?.channels, (list) => {
  if (!list?.length) return
  if (!route.params.channel && !route.params.channelId) {
    const first = textChannels.value[0] ?? list[0]
    if (first) void navigateTo(channelPath(first), { replace: true })
  }
}, { immediate: true })
</script>

<template>
  <div class="flex flex-col h-full min-h-0 select-none">
    <UDropdownMenu :items="serverItems" :ui="{ content: 'w-56' }">
      <button
        type="button"
        class="h-12 px-3 w-full flex items-center gap-1.5 shrink-0 shadow-[0_1px_0_var(--ui-border)] hover:bg-elevated/70"
        :aria-label="guildName"
      >
        <BrandLogo size="lg" :alt="guildName" class="rounded-md" />
        <UIcon name="i-ph-caret-down" class="size-4 text-muted shrink-0" />
      </button>
    </UDropdownMenu>

    <div class="flex-1 overflow-y-auto pt-3 pb-2">
      <USkeleton v-if="channelsQ.isPending.value" class="h-24 mx-2" />
      <UAlert v-else-if="channelsQ.error.value" color="error" title="Could not load channels." class="mx-2" />
      <template v-else>
        <div class="flex items-center pr-2 h-6">
          <button
            type="button"
            class="flex-1 flex items-center gap-0.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-default"
            @click="collapsed.text = !collapsed.text"
          >
            <UIcon :name="collapsed.text ? 'i-ph-caret-right' : 'i-ph-caret-down'" class="size-3" />
            <span class="flex-1 text-start">Text Channels</span>
          </button>
          <UButton
            v-if="can(Permission.manageChannels)"
            icon="i-ph-plus"
            color="neutral"
            variant="ghost"
            size="xs"
            square
            aria-label="Create Channel"
            @click="showCreate = true"
          />
        </div>
        <ul v-show="!collapsed.text" class="px-2">
          <li v-for="ch in textChannels" :key="ch.id">
            <NuxtLink
              :to="channelPath(ch)"
              class="flex items-center gap-1.5 h-8 px-2 rounded-md text-[15px]"
              :class="channelClass(ch)"
            >
              <UIcon name="i-ph-hash" class="size-[18px] text-dimmed shrink-0" />
              <span class="truncate flex-1">{{ ch.name }}</span>
              <UChip v-if="ch.unread && selected !== ch.id" size="sm" color="primary" standalone />
            </NuxtLink>
          </li>
        </ul>

        <button
          type="button"
          class="w-full flex items-center gap-0.5 px-1 pr-2 h-6 mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-default"
          @click="collapsed.voice = !collapsed.voice"
        >
          <UIcon :name="collapsed.voice ? 'i-ph-caret-right' : 'i-ph-caret-down'" class="size-3" />
          <span class="flex-1 text-start">Voice Channels</span>
        </button>
        <ul v-show="!collapsed.voice" class="px-2">
          <li v-for="ch in voiceChannels" :key="ch.id">
            <NuxtLink
              :to="channelPath(ch)"
              class="flex items-center gap-1.5 h-8 px-2 rounded-md text-[15px]"
              :class="channelClass(ch)"
            >
              <UIcon name="i-ph-speaker-high" class="size-[18px] text-dimmed shrink-0" />
              <span class="truncate">{{ ch.name }}</span>
            </NuxtLink>
            <ul
              v-if="huddle.state?.active && selected === ch.id"
              class="pl-8 pr-1 pb-1 space-y-0.5"
            >
              <li
                v-for="id in huddle.state.participantIds"
                :key="id"
                class="flex items-center gap-2 h-7 text-sm text-default"
              >
                <UAvatar size="2xs" :text="'•'" />
                <span class="truncate">{{ membersQ.data.value?.members.find((m) => m.user.id === id)?.user.displayName || 'Member' }}</span>
              </li>
            </ul>
          </li>
        </ul>

        <LayoutDirectMessages :guild-id="guildId" />
      </template>
    </div>

    <div v-if="huddle.connection === 'live'" class="mx-2 mb-0 rounded-lg px-2 py-2 bg-elevated">
      <p class="text-xs font-semibold text-success">Voice Connected</p>
      <p class="text-[11px] text-muted truncate">{{ textChannels.concat(voiceChannels).find((c) => c.id === selected)?.name || 'Huddle' }}</p>
    </div>
    <LayoutUserPanel />
    <SettingsServerSettings v-model:open="showServer" :guild-id="guildId" />

    <UModal v-model:open="showCreate" title="Create Channel">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Channel type">
            <URadioGroup v-model="newType" variant="card" orientation="vertical" :items="channelTypes" />
          </UFormField>
          <UFormField label="Channel name" class="w-full">
            <UInput v-model="newName" placeholder="new-channel" autofocus class="w-full" @keyup.enter="createChannel" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" label="Cancel" @click="showCreate = false" />
        <UButton label="Create Channel" :loading="creating" :disabled="!newName.trim()" @click="createChannel" />
      </template>
    </UModal>

    <UModal v-model:open="showInvite" title="Invite people" description="Share this link. Anyone with it can join.">
      <template #body>
        <USkeleton v-if="inviting" class="h-9" />
        <UInput v-else v-model="inviteUrl" readonly class="w-full">
          <template #trailing>
            <UButton size="xs" label="Copy" @click="copyInvite" />
          </template>
        </UInput>
      </template>
    </UModal>
  </div>
</template>
