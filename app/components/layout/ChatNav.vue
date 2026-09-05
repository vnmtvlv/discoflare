<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import type { ChannelCategoryDTO as Category, ChannelDTO as Ch, MemberDTO as M } from '~~/shared/types'
import { Permission } from '~~/shared/permissions'
import { channelPath } from '~~/shared/paths'
import { isVoiceType } from '~~/shared/dm'

const props = defineProps<{ workspaceId: string }>()
const route = useRoute()
const huddle = useHuddleStore()
const { api } = useApi()
const nav = useNavActions()

const membersQ = useQuery({
  queryKey: computed(() => ['members', props.workspaceId]),
  queryFn: () => api<{ members: M[] }>(`/api/workspaces/${props.workspaceId}/members`),
})
const { can } = usePermissions(computed(() => membersQ.data.value?.members))
const channelsQ = useQuery({
  queryKey: computed(() => ['channels', props.workspaceId]),
  queryFn: () => api<{ categories: Category[]; channels: Ch[] }>(`/api/workspaces/${props.workspaceId}/channels`),
})

const channels = computed(() => channelsQ.data.value?.channels ?? [])
const categories = computed(() => channelsQ.data.value?.categories ?? [])
const channelGroups = computed(() => {
  const groups = categories.value.map(category => ({
    id: category.id,
    name: category.name,
    channels: channels.value.filter(channel => channel.categoryId === category.id),
  }))
  const uncategorized = channels.value.filter(channel => !channel.categoryId)
  if (uncategorized.length) groups.push({ id: 'uncategorized', name: 'Uncategorized', channels: uncategorized })
  return groups
})
const selected = computed(() => String(route.params.channel || route.params.channelId || ''))

function isActive(ch: Ch) {
  const path = channelPath(ch)
  return selected.value === ch.id || route.path === path || route.path.startsWith(`${path}/`)
}

function participantName(id: string) {
  return membersQ.data.value?.members.find(member => member.user.id === id)?.user.displayName || 'Member'
}

watch(() => channelsQ.data.value?.channels, (list) => {
  if (!list?.length) return
  if (route.path === '/channels') {
    const first = list.find(channel => channel.type === 'text') ?? list[0]
    if (first) void navigateTo(channelPath(first), { replace: true })
  }
}, { immediate: true })
</script>

<template>
  <div>
    <USkeleton v-if="channelsQ.isPending.value" class="mx-2 h-24" />
    <UAlert v-else-if="channelsQ.error.value" color="error" title="Could not load channels." class="mx-2" />
    <template v-else>
      <LayoutNavSection
        v-for="(group, index) in channelGroups"
        :key="group.id"
        :label="group.name"
        :collapse-key="`category:${group.id}`"
        :create-label="can(Permission.manageChannels) ? `Create channel in ${group.name}` : undefined"
        :class="index ? 'mt-3' : ''"
        @create="nav.openCreateChannel(group.id)"
      >
        <ul>
          <li v-for="ch in group.channels" :key="ch.id">
            <LayoutNavRow
              :to="channelPath(ch)"
              :active="isActive(ch)"
              :unread="Boolean(ch.unread)"
            >
              <template #leading>
                <UIcon :name="isVoiceType(ch.type) ? 'i-ph-speaker-high' : 'i-ph-hash'" class="size-[18px] shrink-0 text-dimmed" />
              </template>
              {{ ch.name }}
              <template #trailing>
                <UIcon v-if="ch.visibility === 'private'" name="i-ph-lock" class="size-3.5 shrink-0 text-dimmed" />
                <UBadge
                  v-if="ch.unread && selected !== ch.id"
                  color="primary"
                  variant="solid"
                  size="sm"
                  :label="ch.unreadCount && ch.unreadCount > 99 ? '99+' : String(ch.unreadCount || '')"
                  :class="ch.unreadCount ? 'min-w-5 justify-center' : 'size-2 rounded-full p-0'"
                />
              </template>
            </LayoutNavRow>
            <ul
              v-if="isVoiceType(ch.type) && huddle.state?.active && selected === ch.id"
              class="space-y-0.5 pb-1 pl-8 pr-1"
            >
              <li
                v-for="id in huddle.state.participantIds"
                :key="id"
                class="flex h-7 items-center gap-2 text-sm text-default"
              >
                <UAvatar size="2xs" text="•" />
                <span class="truncate">{{ participantName(id) }}</span>
              </li>
            </ul>
          </li>
        </ul>
      </LayoutNavSection>

      <LayoutDirectMessages :workspace-id="workspaceId" class="mt-3" />
    </template>
  </div>
</template>
