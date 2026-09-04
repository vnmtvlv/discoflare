<script setup lang="ts">
import { useQuery, useQueryClient, type InfiniteData } from '@tanstack/vue-query'
import { onKeyStroke } from '@vueuse/core'
import type { ChannelDTO, MemberDTO, MessageDTO, PublicUser } from '~~/shared/types'
import { dmTitle, isDmType, isVoiceType } from '~~/shared/dm'
import { channelPath } from '~~/shared/paths'
import { hasPermission, Permission } from '~~/shared/permissions'

const route = useRoute()
const ui = useUiStore()
const session = useSessionStore()
const presence = usePresenceStore()
const huddle = useHuddleStore()
const qc = useQueryClient()
const { workspaceId } = useWorkspace()
const channelId = computed(() => String(route.params.channel || route.params.channelId || ''))

watch(() => session.user?.id, id => presence.setSelf(id ?? null), { immediate: true })

onKeyStroke(
  event => event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey),
  (event) => {
    event.preventDefault()
    ui.searchOpen = true
  },
)

const membersQ = useQuery({
  queryKey: computed(() => ['members', workspaceId.value]),
  queryFn: ({ queryKey }) => {
    const id = String(queryKey[1] ?? '')
    return id ? $fetch<{ members: MemberDTO[] }>(`/api/workspaces/${id}/members`) : Promise.resolve({ members: [] })
  },
  enabled: computed(() => Boolean(workspaceId.value)),
})
const channelsQ = useQuery({
  queryKey: computed(() => ['channels', workspaceId.value]),
  queryFn: ({ queryKey }) => {
    const id = String(queryKey[1] ?? '')
    return id ? $fetch<{ channels: ChannelDTO[] }>(`/api/workspaces/${id}/channels`) : Promise.resolve({ channels: [] })
  },
  enabled: computed(() => Boolean(workspaceId.value)),
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
const type = computed(() => channel.value?.type || 'text')
const isDm = computed(() => isDmType(type.value))
const isGroup = computed(() => isDm.value && (channel.value?.participants?.length ?? 0) > 2)
const others = computed(() => (channel.value?.participants ?? []).filter((p) => p.id !== session.user?.id))
const headerName = computed(() => {
  if (!isDm.value) return channel.value?.name || '…'
  return channel.value?.title || dmTitle(channel.value?.name, channel.value?.participants ?? [], session.user?.id || '')
})
const frozen = computed(() => Boolean(oneQ.data.value?.frozen || channel.value?.frozen || ui.dmFrozen))
const { can, mine } = usePermissions(members)
const canPin = computed(() => isDm.value ? !frozen.value : can(Permission.manageChannels))
const effectivePermissions = computed(() => channel.value?.permissions ?? mine.value?.role.permissions ?? 0)
const canSendMessages = computed(() => isDm.value ? !frozen.value : hasPermission(effectivePermissions.value, Permission.sendMessages))
const canAttachFiles = computed(() => isDm.value ? !frozen.value : hasPermission(effectivePermissions.value, Permission.attachFiles))
const canStartHuddle = computed(() => isDm.value ? !frozen.value : hasPermission(effectivePermissions.value, Permission.startHuddle))
const composerDisabledPlaceholder = computed(() => frozen.value
  ? 'You can no longer send messages to this user'
  : 'You cannot send messages in this channel')
const { width } = useWindowSize()
const isMobile = computed(() => width.value > 0 && width.value < 768)
const composerPlaceholder = computed(() => {
  if (isDm.value) return `Message @${headerName.value}`
  return `Message #${headerName.value}`
})

const { send } = useChannelSocket(channelId)
useWorkspaceSocket(workspaceId)
const { start, join } = useHuddleSession(channelId, send, { leaveOnUnmount: false })

watch([workspaceId, channelId], () => {
  ui.remember(workspaceId.value, channelId.value)
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
  const ids = presence.typingIn(channelId.value).filter((id) => id !== session.user?.id)
  const names = ids.map((id) => (channel.value?.participants ?? members.value.map((m) => m.user)).find((u) => u.id === id)?.displayName || 'someone')
  if (!names.length) return ''
  if (names.length === 1) return `${names[0]} is typing…`
  return `${names.join(', ')} are typing…`
})

function onReply(id: string) {
  ui.startReply(channelId.value, id)
}
function onEdit(msg: MessageDTO) {
  const content = msg.content.replace(/<@([0-9a-f-]+)>/gi, (_m, id: string) => {
    const m = members.value.find((x) => x.user.id === id)
    return `@${m?.user.displayName || id}`
  })
  ui.startEditing(channelId.value, msg.id, content)
}
function onLast() {
  const data = qc.getQueryData<InfiniteData<{ messages: MessageDTO[] }>>(['messages', channelId.value])
  const all = [...(data?.pages ?? [])].reverse().flatMap((p) => p.messages)
  const last = [...all].reverse().find((m) => m.author.id === session.user?.id && !m.deletedAt)
  if (last) onEdit(last)
}

function linkThreadToMessage(messageId: string, threadId: string) {
  qc.setQueryData<InfiniteData<{ messages: MessageDTO[]; nextCursor: string | null }>>(
    ['messages', channelId.value],
    data => data
      ? {
          ...data,
          pages: data.pages.map(page => ({
            ...page,
            messages: page.messages.map(message => message.id === messageId ? { ...message, threadId } : message),
          })),
        }
      : data,
  )
}

async function onThread(msg: MessageDTO) {
  ui.rightPanelOpen = true
  ui.rightPanelTab = 'threads'
  if (msg.threadId) {
    ui.threadId = msg.threadId
    ui.threadParentId = channelId.value
    return
  }
  const res = await $fetch<{ channel: { id: string } }>(`/api/channels/${channelId.value}/threads`, {
    method: 'POST',
    body: { messageId: msg.id },
  })
  linkThreadToMessage(msg.id, res.channel.id)
  ui.threadId = res.channel.id
  ui.threadParentId = channelId.value
  await qc.invalidateQueries({ queryKey: ['threads', channelId.value] })
}

const addOpen = ref(false)
const addQ = ref('')
const addSearch = useQuery({
  queryKey: computed(() => ['dm-add', workspaceId.value, addQ.value]),
  queryFn: () => $fetch<{ members: PublicUser[] }>(`/api/dms/search?workspaceId=${workspaceId.value}&q=${encodeURIComponent(addQ.value)}`),
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
    role: { id: '', workspaceId: workspaceId.value, key: 'member', name: 'member', permissions: 0, position: 0, isSystem: true },
    nickname: null,
    status: presence.statusOf(u.id),
  }))
})

defineShortcuts({
  escape: () => {
    ui.searchOpen = false
    ui.huddleSetupOpen = false
    ui.cancelComposerIntent(channelId.value)
    if (ui.threadId) ui.cancelComposerIntent(ui.threadId)
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
          <button
            type="button"
            class="hidden sm:flex w-40 h-8 items-center gap-2 rounded-md bg-muted px-2 text-xs text-muted hover:text-default"
            aria-label="Search messages"
            @click="ui.searchOpen = true"
          >
            <UIcon name="i-ph-magnifying-glass" class="size-3.5" />
            <span class="flex-1 text-start">Search</span>
            <kbd class="inline-flex h-5 items-center rounded border border-default bg-default/40 px-1.5 font-sans text-[10px] text-toned">⌘ K</kbd>
          </button>
          <UTooltip v-if="isDm || isVoiceType(type)" text="Start Voice Call">
            <UButton
              icon="i-ph-phone"
              color="neutral"
              variant="ghost"
              size="sm"
              square
              :disabled="!canStartHuddle"
              aria-label="Start huddle"
              @click="start"
            />
          </UTooltip>
          <UTooltip v-if="isDm" text="Add friends to DM">
            <UButton color="neutral" variant="ghost" size="sm" square icon="i-ph-user-plus" aria-label="Add people" @click="addOpen = !addOpen" />
          </UTooltip>
          <UTooltip text="Right panel">
            <UButton
              icon="i-ph-sidebar-simple"
              color="neutral"
              :variant="ui.rightPanelOpen ? 'soft' : 'ghost'"
              size="sm"
              square
              class="hidden md:inline-flex"
              aria-label="Toggle right panel"
              :aria-pressed="ui.rightPanelOpen"
              @click="ui.rightPanelOpen = !ui.rightPanelOpen"
            />
          </UTooltip>
          <UButton
            class="md:hidden"
            icon="i-ph-sidebar-simple"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            aria-label="Right panel"
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
        :can-pin="canPin"
        @reply="onReply"
        @edit="onEdit"
        @thread="onThread"
        @read="(messageId) => send({ t: 'read', messageId })"
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
        :workspace-id="workspaceId"
        :members="members"
        :send="send"
        :disabled="!canSendMessages"
        :disabled-placeholder="composerDisabledPlaceholder"
        :can-attach="canAttachFiles"
        :placeholder="composerPlaceholder"
        @last="onLast"
      />
    </div>
    <ChatThreadPanel
      v-if="ui.rightPanelOpen && ui.rightPanelTab === 'threads' && ui.threadId"
      :workspace-id="workspaceId"
      :members="members"
      :can-pin="canPin"
    />
    <LayoutMemberRail
      v-else-if="ui.rightPanelOpen || isMobile"
      :workspace-id="workspaceId"
      :channel-id="channelId"
      :channel-members="isDm ? channel?.participants : undefined"
      :is-group-dm="isGroup"
      :can-pin="canPin"
    />
    <HuddleSetupModal />
  </div>
</template>
