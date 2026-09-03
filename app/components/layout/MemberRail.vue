<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { DropdownMenuItem } from '@nuxt/ui'
import type { MemberDTO, PublicUser } from '~~/shared/types'
import { Permission } from '~~/shared/permissions'
import { channelPath } from '~~/shared/paths'
import ChannelFilesPanel from '~/features/attachments/components/ChannelFilesPanel.vue'
import ChannelThreadsPanel from '~/features/threads/components/ChannelThreadsPanel.vue'

const props = defineProps<{
  workspaceId: string
  channelId: string
  channelMembers?: PublicUser[]
  isGroupDm?: boolean
}>()
const presence = usePresenceStore()
const session = useSessionStore()
const toast = useToast()
const qc = useQueryClient()
const ui = useUiStore()
const { width } = useWindowSize()
const isMobile = computed(() => width.value > 0 && width.value < 768)

const { data, isPending, error } = useQuery({
  queryKey: computed(() => ['members', props.workspaceId]),
  queryFn: () => $fetch<{ members: MemberDTO[] }>(`/api/workspaces/${props.workspaceId}/members`),
})
const { can } = usePermissions(computed(() => data.value?.members))

const list = computed(() => {
  if (props.channelMembers?.length) {
    return props.channelMembers.map((u) => {
      const m = data.value?.members.find((x) => x.user.id === u.id)
      return m ?? {
        user: u,
        role: { id: '', workspaceId: props.workspaceId, key: 'member', name: 'member', permissions: 0, position: 99, isSystem: true },
        nickname: null,
        status: presence.statusOf(u.id),
      } satisfies MemberDTO
    })
  }
  return data.value?.members ?? []
})

const grouped = computed(() => {
  const online = list.value.filter((m) => presence.statusOf(m.user.id) !== 'offline')
  const offline = list.value.filter((m) => presence.statusOf(m.user.id) === 'offline')
  const byRole = new Map<string, MemberDTO[]>()
  for (const m of online) {
    const key = m.role.name || 'online'
    const arr = byRole.get(key) ?? []
    arr.push(m)
    byRole.set(key, arr)
  }
  return {
    roles: [...byRole.entries()].sort((a, b) => (a[1][0]?.role.position ?? 99) - (b[1][0]?.role.position ?? 99)),
    offline,
  }
})

const kickId = ref<string | null>(null)

async function confirmKick() {
  if (!kickId.value) return
  await $fetch(`/api/workspaces/${props.workspaceId}/members/${kickId.value}`, { method: 'DELETE' })
  await qc.invalidateQueries({ queryKey: ['members', props.workspaceId] })
  toast.add({ title: 'Member kicked', color: 'success' })
  kickId.value = null
}

async function message(userId: string) {
  const res = await $fetch<{ channel: { id: string } }>('/api/dms', { method: 'POST', body: { userId, workspaceId: props.workspaceId } })
  await qc.invalidateQueries({ queryKey: ['dms'] })
  await navigateTo(channelPath(res.channel))
}

function chipColor(status: string) {
  if (status === 'online') return 'success' as const
  if (status === 'idle') return 'warning' as const
  return 'neutral' as const
}

function onKickOpen(open: boolean) {
  if (!open) kickId.value = null
}

function itemsFor(m: MemberDTO): DropdownMenuItem[][] {
  if (m.user.id === session.user?.id || props.isGroupDm) return []
  const actions: DropdownMenuItem[] = [
    { label: 'Message', icon: 'i-ph-chat-circle', onSelect: () => { void message(m.user.id) } },
  ]
  if (can(Permission.kick) && m.role.name !== 'owner') {
    return [actions, [{ label: 'Kick', icon: 'i-ph-user-minus', color: 'error', onSelect: () => { kickId.value = m.user.id } }]]
  }
  return [actions]
}

function roleLabel(name: string) {
  if (name === 'owner') return 'Owner'
  if (name === 'admin') return 'Admin'
  if (name === 'member') return 'Online'
  return name
}
</script>

<template>
  <aside
    class="bg-muted shrink-0 relative flex flex-col min-h-0 overflow-hidden"
    :class="isMobile
      ? (ui.mobilePane === 'members' ? 'absolute inset-0 z-20 w-full flex' : 'hidden')
      : 'hidden md:flex'"
    :style="!isMobile ? { width: `${ui.rightPanelWidth}px` } : undefined"
    aria-label="Right panel"
  >
    <LayoutResizeHandle
      v-if="!isMobile"
      v-model="ui.rightPanelWidth"
      :min="180"
      :max="640"
      side="start"
      label="Resize right panel"
    />
    <header class="h-12 px-3 flex items-center gap-2 shadow-[0_1px_0_var(--ui-border)] shrink-0 bg-muted">
      <UButton
        v-if="isMobile"
        icon="i-ph-caret-left"
        color="neutral"
        variant="ghost"
        size="sm"
        square
        aria-label="Back"
        @click="ui.mobilePane = 'chat'"
      />
      <LayoutRightPanelTabs v-model="ui.rightPanelTab" />
    </header>
    <div v-if="ui.rightPanelTab === 'members'" class="flex-1 min-h-0 overflow-y-auto">
      <div class="flex items-center gap-0.5 px-3 pt-3" aria-label="Member filter">
        <UButton
          size="xs"
          color="neutral"
          :variant="ui.memberTab === 'all' ? 'soft' : 'ghost'"
          label="All"
          @click="ui.memberTab = 'all'"
        />
        <UButton
          size="xs"
          color="neutral"
          :variant="ui.memberTab === 'online' ? 'soft' : 'ghost'"
          label="Online"
          @click="ui.memberTab = 'online'"
        />
      </div>
      <div v-if="isPending && !channelMembers?.length" class="p-3">
        <USkeleton class="h-24" />
      </div>
      <UAlert v-else-if="error && !channelMembers?.length" color="error" title="Could not load members." class="m-3" />
      <p v-else-if="!list.length" class="p-3 text-sm text-muted">No members.</p>
      <div v-else class="px-2 py-4 space-y-4">
      <p v-if="isGroupDm" class="text-xs font-semibold text-muted px-1">Participants — {{ list.length }}</p>
      <template v-if="!isGroupDm">
        <section v-for="[role, group] in grouped.roles" :key="role">
          <h2 class="text-xs font-semibold text-muted px-2 mb-1">{{ roleLabel(role) }} — {{ group.length }}</h2>
          <ul>
            <li v-for="m in group" :key="m.user.id">
              <UDropdownMenu v-if="itemsFor(m).length" :items="itemsFor(m)">
                <button type="button" class="w-full flex items-center gap-2 h-9 px-2 rounded-md hover:bg-elevated text-start">
                  <UChip inset :color="chipColor(presence.statusOf(m.user.id))" position="bottom-right" size="xs">
                    <UAvatar size="xs" :text="m.user.displayName.slice(0, 1).toUpperCase()" :alt="m.user.displayName" />
                  </UChip>
                  <span
                    class="truncate text-sm"
                    :class="m.role.name === 'owner' ? 'text-primary font-medium' : 'text-default'"
                  >{{ m.nickname || m.user.displayName }}</span>
                </button>
              </UDropdownMenu>
              <div v-else class="w-full flex items-center gap-2 h-9 px-2 rounded-md">
                <UChip inset :color="chipColor(presence.statusOf(m.user.id))" position="bottom-right" size="xs">
                  <UAvatar size="xs" :text="m.user.displayName.slice(0, 1).toUpperCase()" :alt="m.user.displayName" />
                </UChip>
                <span
                  class="truncate text-sm"
                  :class="m.role.name === 'owner' ? 'text-primary font-medium' : 'text-default'"
                >{{ m.nickname || m.user.displayName }}</span>
              </div>
            </li>
          </ul>
        </section>
        <section v-if="ui.memberTab === 'all' && grouped.offline.length">
          <h2 class="text-xs font-semibold text-muted px-2 mb-1">Offline — {{ grouped.offline.length }}</h2>
          <ul>
            <li v-for="m in grouped.offline" :key="m.user.id">
              <UDropdownMenu v-if="itemsFor(m).length" :items="itemsFor(m)">
                <button type="button" class="w-full flex items-center gap-2 h-9 px-2 rounded-md hover:bg-elevated text-start opacity-70">
                  <UChip inset color="neutral" position="bottom-right" size="xs">
                    <UAvatar size="xs" :text="m.user.displayName.slice(0, 1).toUpperCase()" :alt="m.user.displayName" />
                  </UChip>
                  <span class="truncate text-sm text-muted">{{ m.nickname || m.user.displayName }}</span>
                </button>
              </UDropdownMenu>
              <div v-else class="w-full flex items-center gap-2 h-9 px-2 rounded-md opacity-70">
                <UChip inset color="neutral" position="bottom-right" size="xs">
                  <UAvatar size="xs" :text="m.user.displayName.slice(0, 1).toUpperCase()" :alt="m.user.displayName" />
                </UChip>
                <span class="truncate text-sm text-muted">{{ m.nickname || m.user.displayName }}</span>
              </div>
            </li>
          </ul>
        </section>
      </template>
      <ul v-else>
        <li v-for="m in list" :key="m.user.id" class="flex items-center gap-2 h-9 px-2">
          <UChip inset :color="chipColor(presence.statusOf(m.user.id))" position="bottom-right" size="xs">
            <UAvatar size="xs" :text="m.user.displayName.slice(0, 1).toUpperCase()" :alt="m.user.displayName" />
          </UChip>
          <span class="truncate text-sm">{{ m.nickname || m.user.displayName }}</span>
        </li>
        </ul>
      </div>
    </div>
    <div v-else-if="ui.rightPanelTab === 'threads'" class="flex-1 min-h-0 overflow-y-auto">
      <ChannelThreadsPanel :channel-id="channelId" />
    </div>
    <div v-else class="flex-1 min-h-0 overflow-y-auto">
      <ChannelFilesPanel :channel-id="channelId" />
    </div>
    <UModal :open="Boolean(kickId)" title="Kick this member?" @update:open="onKickOpen">
      <template #footer>
        <UButton color="neutral" variant="outline" label="Cancel" @click="kickId = null" />
        <UButton color="error" label="Kick" @click="confirmKick" />
      </template>
    </UModal>
  </aside>
</template>
