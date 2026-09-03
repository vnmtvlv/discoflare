<script setup lang="ts">
import { useQuery, useQueryClient, type InfiniteData } from '@tanstack/vue-query'
import type { ChannelDTO, MemberDTO, MessageDTO, PublicUser } from '~~/shared/types'
import { dmTitle, isDmType, isVoiceType, normalizeChannelType } from '~~/shared/dm'
import { channelPath } from '~~/shared/paths'

const route = useRoute()
const ui = useUiStore()
const session = useSessionStore()
const presence = usePresenceStore()
const huddle = useHuddleStore()
const qc = useQueryClient()
const { guildId } = useWorkspace()
const channelId = computed(() => String(route.params.channel || route.params.channelId || ''))

const membersQ = useQuery({
  queryKey: computed(() => ['members', guildId.value]),
  queryFn: () => $fetch<{ members: MemberDTO[] }>(`/api/guilds/${guildId.value}/members`),
  enabled: computed(() => Boolean(guildId.value)),
})
const channelsQ = useQuery({
  queryKey: computed(() => ['channels', guildId.value]),
  queryFn: () => $fetch<{ channels: ChannelDTO[] }>(`/api/guilds/${guildId.value}/channels`),
  enabled: computed(() => Boolean(guildId.value)),
})
const dmsQ = useQuery({
  queryKey: ['dms'],
  queryFn: () => $fetch<{ channels: ChannelDTO[] }>('/api/dms'),
})
const oneQ = useQuery({
  queryKey: computed(() => ['channel', channelId.value]),
  queryFn: () => $fetch<{ channel: ChannelDTO; frozen?: boolean }>(`/api/channels/${channelId.value}`),
  enabled: computed(() => Boolean(channelId.value)),
})

const channel = computed(() => {
  return oneQ.data.value?.channel
    ?? dmsQ.data.value?.channels.find((c) => c.id === channelId.value)
    ?? channelsQ.data.value?.channels.find((c) => c.id === channelId.value)
})
const members = computed(() => membersQ.data.value?.members ?? [])
const type = computed(() => normalizeChannelType(channel.value?.type || 'text'))
const isDm = computed(() => isDmType(type.value))
const isGroup = computed(() => isDm.value && (channel.value?.participants?.length ?? 0) > 2)
const others = computed(() => (channel.value?.participants ?? []).filter((p) => p.id !== session.user?.id))
const headerName = computed(() => {
  if (!isDm.value) return channel.value?.name || '…'
  return channel.value?.title || dmTitle(channel.value?.name, channel.value?.participants ?? [], session.user?.id || '')
})
const frozen = computed(() => Boolean(oneQ.data.value?.frozen || channel.value?.frozen || ui.dmFrozen))
const { width } = useWindowSize()
const isMobile = computed(() => width.value > 0 && width.value < 768)
const composerPlaceholder = computed(() => {
  if (isDm.value) return `Message @${headerName.value}`
  return `Message #${headerName.value}`
})

const { send } = useChannelSocket(channelId)
useGuildSocket(guildId)
const { start, join } = useHuddleSession(channelId, send, { leaveOnUnmount: false })

watch([guildId, channelId], () => {
  ui.remember(guildId.value, channelId.value)
  huddle.setState(null)
  ui.threadId = null
}, { immediate: true })

watch(() => oneQ.data.value?.channel, (ch) => {
  if (!ch) return
  const threadId = route.params.threadId ? String(route.params.threadId) : undefined
  const want = channelPath(ch, threadId)
  if (route.path !== want) void navigateTo(want, { replace: true })
})

const typingLine = computed(() => {
  const now = Date.now()
  const ids = Object.entries(presence.typing).filter(([, exp]) => exp > now).map(([id]) => id).filter((id) => id !== session.user?.id)
  const names = ids.map((id) => (channel.value?.participants ?? members.value.map((m) => m.user)).find((u) => u.id === id)?.displayName || 'someone')
  if (!names.length) return ''
  if (names.length === 1) return `${names[0]} is typing…`
  return `${names.join(', ')} are typing…`
})

function onReply(id: string) {
  ui.replyToId = id
}
function onEdit(msg: MessageDTO) {
  ui.editingId = msg.id
  ui.composerDraft = msg.content.replace(/<@([0-9a-f-]+)>/gi, (_m, id: string) => {
    const m = members.value.find((x) => x.user.id === id)
    return `@${m?.user.displayName || id}`
  })
}
function onLast() {
  const data = qc.getQueryData<InfiniteData<{ messages: MessageDTO[] }>>(['messages', channelId.value])
  const all = [...(data?.pages ?? [])].reverse().flatMap((p) => p.messages)
  const last = [...all].reverse().find((m) => m.author.id === session.user?.id && !m.deletedAt)
  if (last) onEdit(last)
}

async function onThread(msg: MessageDTO) {
  if (msg.threadId) {
    ui.threadId = msg.threadId
    ui.threadParentId = channelId.value
    return
  }
  const res = await $fetch<{ channel: { id: string } }>(`/api/channels/${channelId.value}/threads`, {
    method: 'POST',
    body: { messageId: msg.id },
  })
  ui.threadId = res.channel.id
  ui.threadParentId = channelId.value
}

const addOpen = ref(false)
const addQ = ref('')
const addSearch = useQuery({
  queryKey: computed(() => ['dm-add', guildId.value, addQ.value]),
  queryFn: () => $fetch<{ members: PublicUser[] }>(`/api/dms/search?guildId=${guildId.value}&q=${encodeURIComponent(addQ.value)}`),
  enabled: computed(() => addOpen.value),
})

async function addPerson(userId: string) {
  await $fetch(`/api/dms/${channelId.value}/participants`, { method: 'POST', body: { userId } })
  await qc.invalidateQueries({ queryKey: ['dms'] })
  await qc.invalidateQueries({ queryKey: ['channel', channelId.value] })
  addOpen.value = false
}

const renaming = ref(false)
const rename = ref('')
watch(headerName, (n) => { if (!renaming.value) rename.value = n }, { immediate: true })

async function saveName() {
  await $fetch(`/api/dms/${channelId.value}`, { method: 'PATCH', body: { name: rename.value.trim() || null } })
  renaming.value = false
  await qc.invalidateQueries({ queryKey: ['dms'] })
  await qc.invalidateQueries({ queryKey: ['channel', channelId.value] })
}

const huddleMembers = computed<MemberDTO[]>(() => {
  if (!isDm.value) return members.value
  return (channel.value?.participants ?? []).map((u) => ({
    user: u,
    role: { id: '', guildId: guildId.value, name: 'member', permissions: 0, position: 0 },
    nickname: null,
    lastSeenAt: '',
    status: presence.statusOf(u.id),
  }))
})

defineShortcuts({
  escape: () => {
    ui.huddleSetupOpen = false
    ui.replyToId = null
    ui.editingId = null
    ui.threadId = null
    renaming.value = false
    addOpen.value = false
  },
})
</script>

<template>
  <div class="flex-1 min-h-0 h-full flex bg-default">
    <div class="flex-1 min-w-0 flex flex-col min-h-0">
      <header class="h-12 pl-4 pr-2 flex items-center gap-2 shadow-[0_1px_0_var(--ui-border)] shrink-0 z-10 bg-default">
        <UButton
          v-if="isMobile"
          icon="i-ph-list"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          aria-label="Open channels"
          @click="ui.mobilePane = 'channels'"
        />
        <UIcon v-if="!isDm" :name="isVoiceType(type) ? 'i-ph-speaker-high' : 'i-ph-hash'" class="size-5 text-muted shrink-0" />
        <UAvatar v-else size="2xs" :text="(others[0]?.displayName || headerName).slice(0, 1).toUpperCase()" />
        <UInput
          v-if="isGroup && renaming"
          v-model="rename"
          size="sm"
          class="max-w-xs"
          autofocus
          @keyup.enter="saveName"
          @keyup.escape="renaming = false"
        />
        <h1
          v-else
          class="font-semibold text-[16px] truncate text-highlighted"
          :class="isGroup ? 'cursor-text' : ''"
          @dblclick="isGroup && (renaming = true)"
        >{{ headerName }}</h1>
        <UChip v-if="isDm && others[0] && !isGroup" :color="presence.statusOf(others[0].id) === 'online' ? 'success' : 'neutral'" size="sm" standalone />
        <USeparator v-if="!isDm && channel?.topic" orientation="vertical" class="h-4" />
        <p v-if="!isDm" class="text-sm text-muted truncate hidden lg:block min-w-0 flex-1">{{ channel?.topic }}</p>
        <div class="ml-auto flex items-center gap-2">
          <UInput
            v-model="ui.searchQuery"
            icon="i-ph-magnifying-glass"
            size="sm"
            placeholder="Search"
            class="hidden sm:flex w-36"
            :ui="{ base: 'bg-muted ring-0' }"
          />
          <UTooltip v-if="isDm || isVoiceType(type)" text="Start Voice Call">
            <UButton
              icon="i-ph-phone"
              color="neutral"
              variant="ghost"
              size="sm"
              square
              aria-label="Start huddle"
              @click="start"
            />
          </UTooltip>
          <UTooltip v-if="isDm" text="Add friends to DM">
            <UButton color="neutral" variant="ghost" size="sm" square icon="i-ph-user-plus" aria-label="Add people" @click="addOpen = !addOpen" />
          </UTooltip>
          <UTooltip text="Member list">
            <UButton
              icon="i-ph-users"
              color="neutral"
              :variant="ui.memberRailOpen ? 'soft' : 'ghost'"
              size="sm"
              square
              class="hidden md:inline-flex"
              aria-label="Toggle member list"
              :aria-pressed="ui.memberRailOpen"
              @click="ui.memberRailOpen = !ui.memberRailOpen"
            />
          </UTooltip>
          <UButton
            class="md:hidden"
            icon="i-ph-users"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            aria-label="Members"
            @click="ui.mobilePane = 'members'"
          />
        </div>
      </header>
      <div v-if="addOpen" class="border-b border-default p-2 shrink-0">
        <UInput v-model="addQ" size="sm" icon="i-ph-magnifying-glass" placeholder="Add people" />
        <UButton
          v-for="m in addSearch.data.value?.members ?? []"
          :key="m.id"
          variant="ghost"
          color="neutral"
          size="sm"
          block
          class="justify-start"
          :label="m.displayName"
          @click="addPerson(m.id)"
        />
      </div>
      <UAlert
        v-if="huddle.state?.active && huddle.connection !== 'live'"
        color="success"
        title="In a call"
        class="rounded-none shrink-0"
      >
        <template #actions>
          <UButton size="xs" label="Join" @click="join" />
        </template>
      </UAlert>
      <ChatMessageList
        :channel-id="channelId"
        :members="members"
        :channel-name="headerName"
        :is-dm="isDm"
        @reply="onReply"
        @edit="onEdit"
        @thread="onThread"
      />
      <UAlert v-if="frozen" color="neutral" variant="subtle" title="You can no longer send messages to this user." class="rounded-none shrink-0" />
      <p v-if="typingLine" class="px-4 text-xs text-muted h-5 shrink-0">{{ typingLine }}</p>
      <HuddleBar
        v-if="isVoiceType(type) || isDm || huddle.state?.active"
        :channel-id="channelId"
        :members="huddleMembers"
        :send="send"
      />
      <ChatComposer
        :channel-id="channelId"
        :guild-id="guildId"
        :members="members"
        :send="send"
        :disabled="frozen"
        :placeholder="composerPlaceholder"
        @last="onLast"
      />
    </div>
    <LayoutMemberRail
      v-if="ui.memberRailOpen || isMobile"
      :guild-id="guildId"
      :dm-participants="isDm ? channel?.participants : undefined"
      :is-group-dm="isGroup"
    />
    <ChatThreadPanel :guild-id="guildId" :members="members" />
    <HuddleSetupModal />
  </div>
</template>
