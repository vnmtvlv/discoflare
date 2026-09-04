<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { DropdownMenuItem } from '@nuxt/ui'
import type { ChannelCategoryDTO as Category, ChannelDTO as Ch, WorkspaceDTO as W, MemberDTO as M } from '~~/shared/types'
import { Permission } from '~~/shared/permissions'
import { channelPath } from '~~/shared/paths'
import { isVoiceType } from '~~/shared/dm'
import { useClipboard } from '@vueuse/core'

const props = defineProps<{ workspaceId: string }>()
const route = useRoute()
const qc = useQueryClient()
const toast = useToast()
const huddle = useHuddleStore()
const { copy } = useClipboard()
const { serverUrl } = useApi()
const membersQ = useQuery({
  queryKey: computed(() => ['members', props.workspaceId]),
  queryFn: () => $fetch<{ members: M[] }>(`/api/workspaces/${props.workspaceId}/members`),
})
const { can } = usePermissions(computed(() => membersQ.data.value?.members))

const workspaceQ = useQuery({
  queryKey: computed(() => ['workspace', props.workspaceId]),
  queryFn: () => $fetch<{ workspace: W }>(`/api/workspaces/${props.workspaceId}`),
})
const channelsQ = useQuery({
  queryKey: computed(() => ['channels', props.workspaceId]),
  queryFn: () => $fetch<{ categories: Category[]; channels: Ch[] }>(`/api/workspaces/${props.workspaceId}/channels`),
})
const workspacesQ = useQuery({
  queryKey: ['workspaces'],
  queryFn: () => $fetch<{ workspaces: W[] }>('/api/workspaces'),
})

const newName = ref('')
const newType = ref<'text' | 'voice'>('text')
const newPrivate = ref(false)
const newMemberIds = ref<string[]>([])
const newCategoryId = ref<string | null>(null)
const newCategoryName = ref('')
const showCreate = ref(false)
const showCreateCategory = ref(false)
const showInvite = ref(false)
const showWorkspaceSettings = ref(false)
const inviteUrl = ref('')
const inviting = ref(false)
const creating = ref(false)
const creatingCategory = ref(false)
const collapsed = ref<Record<string, boolean>>({})

const channels = computed(() => channelsQ.data.value?.channels ?? [])
const categories = computed(() => channelsQ.data.value?.categories ?? [])
const categoryOptions = computed(() => [
  { label: 'Uncategorized', value: null },
  ...categories.value.map(category => ({ label: category.name, value: category.id })),
])
const channelGroups = computed(() => {
  const groups = categories.value.map(category => ({
    ...category,
    channels: channels.value.filter(channel => channel.categoryId === category.id),
  }))
  const uncategorized = channels.value.filter(channel => !channel.categoryId)
  if (uncategorized.length) {
    groups.push({ id: 'uncategorized', name: 'Uncategorized', position: Number.MAX_SAFE_INTEGER, createdAt: '', channels: uncategorized })
  }
  return groups
})
const selected = computed(() => String(route.params.channel || route.params.channelId || ''))
const workspaceName = computed(() => workspaceQ.data.value?.workspace.name || '…')
const workspaceIconUrl = computed(() => {
  const workspace = workspaceQ.data.value?.workspace
  if (!workspace?.iconR2Key) return undefined
  return serverUrl(`/api/workspaces/${props.workspaceId}/icon?v=${encodeURIComponent(workspace.updatedAt)}`)
})

const otherWorkspaces = computed(() => (workspacesQ.data.value?.workspaces ?? []).filter((item) => item.id !== props.workspaceId))

const serverItems = computed<DropdownMenuItem[][]>(() => {
  const invite: DropdownMenuItem[] = can(Permission.invite)
    ? [{ label: 'Invite People', icon: 'i-ph-user-plus', color: 'primary', onSelect: () => { showInvite.value = true } }]
    : []
  const manage: DropdownMenuItem[] = []
  if (can(Permission.manageChannels)) {
    manage.push(
      { label: 'Create Channel', icon: 'i-ph-hash', onSelect: () => { openCreateChannel() } },
      { label: 'Create Category', icon: 'i-ph-folder-plus', onSelect: () => { showCreateCategory.value = true } },
    )
  }
  manage.push({ label: 'Workspace Settings', icon: 'i-ph-gear', onSelect: () => { nextTick(() => { showWorkspaceSettings.value = true }) } })
  const switcher: DropdownMenuItem[] = otherWorkspaces.value.map((item) => ({
    label: item.name,
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

function openCreateChannel(categoryId: string | null = categories.value[0]?.id ?? null) {
  newCategoryId.value = categoryId === 'uncategorized' ? null : categoryId
  showCreate.value = true
}

function toggleCategory(categoryId: string) {
  collapsed.value = { ...collapsed.value, [categoryId]: !collapsed.value[categoryId] }
}

async function createChannel() {
  if (!newName.value.trim()) return
  creating.value = true
  try {
    const res = await $fetch<{ channel: Ch }>(`/api/workspaces/${props.workspaceId}/channels`, {
      method: 'POST',
      body: {
        name: newName.value.trim().toLowerCase().replace(/\s+/g, '-'),
        type: newType.value,
        visibility: newPrivate.value ? 'private' : 'workspace',
        categoryId: newCategoryId.value,
        memberIds: newPrivate.value ? newMemberIds.value : undefined,
      },
    })
    await qc.invalidateQueries({ queryKey: ['channels', props.workspaceId] })
    showCreate.value = false
    newName.value = ''
    newPrivate.value = false
    newMemberIds.value = []
    newCategoryId.value = categories.value[0]?.id ?? null
    await navigateTo(channelPath(res.channel))
  }
  finally {
    creating.value = false
  }
}

async function createCategory() {
  const name = newCategoryName.value.trim()
  if (!name) return
  creatingCategory.value = true
  try {
    const res = await $fetch<{ category: Category }>(`/api/workspaces/${props.workspaceId}/categories`, {
      method: 'POST',
      body: { name },
    })
    await qc.invalidateQueries({ queryKey: ['channels', props.workspaceId] })
    newCategoryName.value = ''
    showCreateCategory.value = false
    openCreateChannel(res.category.id)
  }
  finally {
    creatingCategory.value = false
  }
}

async function makeInvite() {
  inviting.value = true
  try {
    const res = await $fetch<{ invite: { code: string; url: string } }>(`/api/workspaces/${props.workspaceId}/invites`, { method: 'POST', body: {} })
    inviteUrl.value = serverUrl(res.invite.url)
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
    const first = list.find(channel => channel.type === 'text') ?? list[0]
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
        :aria-label="workspaceName"
      >
        <UAvatar v-if="workspaceIconUrl" size="sm" :src="workspaceIconUrl" :alt="workspaceName" class="rounded-md" />
        <BrandLogo v-else size="lg" :alt="workspaceName" class="rounded-md" />
        <UIcon name="i-ph-caret-down" class="size-4 text-muted shrink-0" />
      </button>
    </UDropdownMenu>

    <div class="flex-1 overflow-y-auto pt-3 pb-2">
      <div class="px-2 pb-3">
        <NuxtLink
          to="/tasks"
          class="flex items-center gap-2 h-9 px-2 rounded-md text-[15px]"
          :class="route.path === '/tasks' ? 'bg-accented text-highlighted' : 'text-muted hover:bg-elevated/80 hover:text-default'"
        >
          <UIcon name="i-ph-kanban" class="size-[18px] shrink-0" />
          <span>Tasks</span>
        </NuxtLink>
      </div>
      <USkeleton v-if="channelsQ.isPending.value" class="h-24 mx-2" />
      <UAlert v-else-if="channelsQ.error.value" color="error" title="Could not load channels." class="mx-2" />
      <template v-else>
        <section v-for="(group, index) in channelGroups" :key="group.id" :class="index ? 'mt-3' : ''">
          <div class="flex items-center pr-2 h-6">
            <button
              type="button"
              class="flex-1 min-w-0 flex items-center gap-1 pl-3 pr-1 text-xs font-semibold text-muted hover:text-default"
              @click="toggleCategory(group.id)"
            >
              <span class="truncate text-start">{{ group.name }}</span>
              <UIcon :name="collapsed[group.id] ? 'i-ph-caret-right' : 'i-ph-caret-down'" class="size-3 shrink-0" />
            </button>
            <UButton
              v-if="can(Permission.manageChannels)"
              icon="i-ph-plus"
              color="neutral"
              variant="ghost"
              size="xs"
              square
              :aria-label="`Create channel in ${group.name}`"
              @click="openCreateChannel(group.id)"
            />
          </div>
          <ul v-show="!collapsed[group.id]" class="px-2">
            <li v-for="ch in group.channels" :key="ch.id">
              <NuxtLink
                :to="channelPath(ch)"
                class="flex items-center gap-1.5 h-8 px-2 rounded-md text-[15px]"
                :class="channelClass(ch)"
              >
                <UIcon :name="isVoiceType(ch.type) ? 'i-ph-speaker-high' : 'i-ph-hash'" class="size-[18px] text-dimmed shrink-0" />
                <span class="truncate flex-1">{{ ch.name }}</span>
                <UIcon v-if="ch.visibility === 'private'" name="i-ph-lock" class="size-3.5 text-dimmed shrink-0" />
                <UChip v-if="ch.unread && selected !== ch.id" size="sm" color="primary" standalone />
              </NuxtLink>
              <ul
                v-if="isVoiceType(ch.type) && huddle.state?.active && selected === ch.id"
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
        </section>

        <LayoutDirectMessages :workspace-id="workspaceId" />
      </template>
    </div>

    <div v-if="huddle.connection === 'live'" class="mx-2 mb-0 rounded-lg px-2 py-2 bg-elevated">
      <p class="text-xs font-semibold text-success">Voice Connected</p>
      <p class="text-[11px] text-muted truncate">{{ channels.find((c) => c.id === selected)?.name || 'Huddle' }}</p>
    </div>
    <LayoutUserPanel />
    <SettingsWorkspaceSettings v-model:open="showWorkspaceSettings" :workspace-id="workspaceId" />

    <UModal v-model:open="showCreate" title="Create Channel">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Channel type">
            <URadioGroup v-model="newType" variant="card" orientation="vertical" :items="channelTypes" />
          </UFormField>
          <UFormField label="Channel name" class="w-full">
            <UInput v-model="newName" placeholder="new-channel" autofocus class="w-full" @keyup.enter="createChannel" />
          </UFormField>
          <UFormField label="Category">
            <USelect v-model="newCategoryId" :items="categoryOptions" class="w-full" />
          </UFormField>
          <UCheckbox v-model="newPrivate" label="Private channel" />
          <UFormField v-if="newPrivate" label="Members">
            <div class="max-h-40 overflow-y-auto space-y-2 rounded-md border border-default p-3">
              <UCheckbox
                v-for="member in membersQ.data.value?.members ?? []"
                :key="member.user.id"
                :model-value="newMemberIds.includes(member.user.id)"
                :label="member.nickname || member.user.displayName"
                @update:model-value="(checked) => newMemberIds = checked
                  ? [...new Set([...newMemberIds, member.user.id])]
                  : newMemberIds.filter((id) => id !== member.user.id)"
              />
            </div>
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" label="Cancel" @click="showCreate = false" />
        <UButton label="Create Channel" :loading="creating" :disabled="!newName.trim()" @click="createChannel" />
      </template>
    </UModal>

    <UModal v-model:open="showCreateCategory" title="Create Category">
      <template #body>
        <UFormField label="Category name" class="w-full">
          <UInput v-model="newCategoryName" placeholder="Category" autofocus class="w-full" @keyup.enter="createCategory" />
        </UFormField>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" label="Cancel" @click="showCreateCategory = false" />
        <UButton label="Create Category" :loading="creatingCategory" :disabled="!newCategoryName.trim()" @click="createCategory" />
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
