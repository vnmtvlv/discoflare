<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import * as z from 'zod'
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'
import type { AuditEntryDTO, ChannelDTO, GuildDTO, MemberDTO } from '~~/shared/types'
import { Permission } from '~~/shared/permissions'
import { formatDateTime } from '~~/shared/format'
import { useClipboard } from '@vueuse/core'

type Section = 'overview' | 'roles' | 'members' | 'invites' | 'audit'

const props = defineProps<{ guildId: string }>()
const open = defineModel<boolean>('open', { default: false })

const toast = useToast()
const qc = useQueryClient()
const { copy } = useClipboard()
const section = ref<Section>('overview')

const schema = z.object({ name: z.string().min(1).max(80) })
type Schema = z.output<typeof schema>
const state = reactive<Partial<Schema>>({ name: '' })
const saving = ref(false)

const guildQ = useQuery({
  queryKey: computed(() => ['guild', props.guildId]),
  queryFn: () => $fetch<{ guild: GuildDTO }>(`/api/guilds/${props.guildId}`),
  enabled: computed(() => open.value),
})
const membersQ = useQuery({
  queryKey: computed(() => ['members', props.guildId]),
  queryFn: () => $fetch<{ members: MemberDTO[] }>(`/api/guilds/${props.guildId}/members`),
  enabled: computed(() => open.value),
})
const channelsQ = useQuery({
  queryKey: computed(() => ['channels', props.guildId]),
  queryFn: () => $fetch<{ channels: ChannelDTO[] }>(`/api/guilds/${props.guildId}/channels`),
  enabled: computed(() => open.value),
})
const invitesQ = useQuery({
  queryKey: computed(() => ['invites', props.guildId]),
  queryFn: () => $fetch<{ invites: Array<{ code: string; url: string; maxUses: number; uses: number; expiresAt: string | null; createdAt: string }> }>(`/api/guilds/${props.guildId}/invites`),
  enabled: computed(() => open.value && section.value === 'invites'),
})
const auditQ = useQuery({
  queryKey: computed(() => ['audit', props.guildId]),
  queryFn: () => $fetch<{ entries: AuditEntryDTO[] }>(`/api/guilds/${props.guildId}/audit`),
  enabled: computed(() => open.value && section.value === 'audit'),
})
const { can } = usePermissions(computed(() => membersQ.data.value?.members))

watch(() => guildQ.data.value?.guild.name, (n) => { if (n) state.name = n }, { immediate: true })
watch(open, (v) => { if (v) section.value = 'overview' })

const serverNav = [
  { id: 'overview' as const, label: 'Overview' },
  { id: 'roles' as const, label: 'Roles' },
  { id: 'audit' as const, label: 'Audit Log' },
]
const userNav = [
  { id: 'members' as const, label: 'Members' },
  { id: 'invites' as const, label: 'Invites' },
]

const inviteUrl = ref('')
const inviting = ref(false)
const kickId = ref<string | null>(null)

const roles = computed(() => {
  const map = new Map<string, { name: string; position: number; count: number }>()
  for (const m of membersQ.data.value?.members ?? []) {
    const cur = map.get(m.role.id) ?? { name: m.role.name, position: m.role.position, count: 0 }
    cur.count += 1
    map.set(m.role.id, cur)
  }
  return [...map.values()].sort((a, b) => a.position - b.position)
})

const memberCount = computed(() => membersQ.data.value?.members.length ?? 0)
const channelCount = computed(() => (channelsQ.data.value?.channels ?? []).filter((c) => c.type !== 'dm' && c.type !== 'thread').length)
const guildName = computed(() => guildQ.data.value?.guild.name || 'Server')
const guildInitial = computed(() => guildName.value.slice(0, 1).toUpperCase())

async function onSave(event: FormSubmitEvent<Schema>) {
  saving.value = true
  try {
    await $fetch(`/api/guilds/${props.guildId}`, { method: 'PATCH', body: event.data })
    await qc.invalidateQueries({ queryKey: ['guild', props.guildId] })
    toast.add({ title: 'Server updated', color: 'success' })
  }
  catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

async function makeInvite() {
  inviting.value = true
  try {
    const res = await $fetch<{ invite: { url: string } }>(`/api/guilds/${props.guildId}/invites`, { method: 'POST', body: {} })
    inviteUrl.value = `${location.origin}${res.invite.url}`
    await qc.invalidateQueries({ queryKey: ['invites', props.guildId] })
  }
  catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
  finally {
    inviting.value = false
  }
}

async function copyInvite(url?: string) {
  const value = url || inviteUrl.value
  if (!value) return
  await copy(value.startsWith('http') ? value : `${location.origin}${value}`)
  toast.add({ title: 'Invite copied', color: 'success' })
}

async function confirmKick() {
  if (!kickId.value) return
  await $fetch(`/api/guilds/${props.guildId}/members/${kickId.value}`, { method: 'DELETE' })
  await qc.invalidateQueries({ queryKey: ['members', props.guildId] })
  kickId.value = null
  toast.add({ title: 'Member kicked', color: 'success' })
}

const columns: TableColumn<AuditEntryDTO>[] = [
  { accessorKey: 'createdAt', header: 'When', cell: ({ row }) => formatDateTime(row.original.createdAt) },
  { accessorKey: 'actorName', header: 'Actor' },
  { accessorKey: 'action', header: 'Action' },
  { accessorKey: 'targetType', header: 'Target', cell: ({ row }) => `${row.original.targetType} ${row.original.targetId.slice(0, 8)}` },
]

function roleLabel(name: string) {
  if (name === 'owner') return 'Owner'
  if (name === 'admin') return 'Admin'
  return 'Member'
}

function navClass(id: Section) {
  return section.value === id
    ? 'bg-accented text-highlighted'
    : 'text-muted hover:bg-elevated hover:text-default'
}
</script>

<template>
  <SettingsOverlay v-model:open="open">
    <template #nav>
      <p class="px-2.5 mb-1 text-[11px] font-bold uppercase tracking-wide text-muted truncate">{{ guildName }}</p>
      <nav class="space-y-0.5">
        <UButton
          v-for="item in serverNav"
          :key="item.id"
          :label="item.label"
          color="neutral"
          :variant="section === item.id ? 'soft' : 'ghost'"
          block
          class="justify-start"
          :class="navClass(item.id)"
          @click="section = item.id"
        />
      </nav>
      <USeparator class="my-3" />
      <p class="px-2.5 mb-1 text-[11px] font-bold uppercase tracking-wide text-muted">User Management</p>
      <nav class="space-y-0.5">
        <UButton
          v-for="item in userNav"
          :key="item.id"
          :label="item.label"
          color="neutral"
          :variant="section === item.id ? 'soft' : 'ghost'"
          block
          class="justify-start"
          :class="navClass(item.id)"
          @click="section = item.id"
        />
      </nav>
    </template>

    <template v-if="section === 'overview'">
      <h1 class="text-xl font-semibold text-highlighted">Server Overview</h1>
      <div class="mt-8 flex items-start gap-6">
        <UAvatar size="3xl" :text="guildInitial" />
        <UForm :schema="schema" :state="state" class="flex-1 max-w-md space-y-4" @submit="onSave">
          <UFormField name="name" label="Server Name">
            <UInput v-model="state.name" class="w-full" :disabled="!can(Permission.manageGuild)" />
          </UFormField>
          <UButton v-if="can(Permission.manageGuild)" type="submit" label="Save Changes" :loading="saving" />
        </UForm>
      </div>
      <div class="mt-10 grid grid-cols-2 gap-4 max-w-md">
        <div class="rounded-lg bg-elevated p-4">
          <p class="text-[11px] font-bold uppercase tracking-wide text-muted">Members</p>
          <p class="text-2xl font-semibold text-highlighted mt-1">{{ memberCount }}</p>
        </div>
        <div class="rounded-lg bg-elevated p-4">
          <p class="text-[11px] font-bold uppercase tracking-wide text-muted">Channels</p>
          <p class="text-2xl font-semibold text-highlighted mt-1">{{ channelCount }}</p>
        </div>
      </div>
      <p class="mt-6 text-sm text-muted">This install is a single workspace. There is no server switcher.</p>
    </template>

    <template v-else-if="section === 'roles'">
      <h1 class="text-xl font-semibold text-highlighted">Roles</h1>
      <p class="mt-1 text-sm text-muted">Default roles for this workspace. Owner and admin have full permissions.</p>
      <ul class="mt-6 divide-y divide-default">
        <li v-for="r in roles" :key="r.name" class="flex items-center gap-3 py-3">
          <span class="size-3 rounded-full bg-primary" />
          <div class="min-w-0 flex-1">
            <p class="font-medium text-highlighted">{{ roleLabel(r.name) }}</p>
            <p class="text-xs text-muted">{{ r.count }} {{ r.count === 1 ? 'member' : 'members' }}</p>
          </div>
        </li>
      </ul>
    </template>

    <template v-else-if="section === 'members'">
      <h1 class="text-xl font-semibold text-highlighted">Members</h1>
      <p class="mt-1 text-sm text-muted">{{ memberCount }} {{ memberCount === 1 ? 'member' : 'members' }} in this workspace.</p>
      <ul class="mt-6 divide-y divide-default">
        <li v-for="m in membersQ.data.value?.members ?? []" :key="m.user.id" class="flex items-center gap-3 py-3">
          <UAvatar size="sm" :text="m.user.displayName.slice(0, 1).toUpperCase()" />
          <div class="min-w-0 flex-1">
            <p class="font-medium truncate">{{ m.nickname || m.user.displayName }}</p>
            <p class="text-xs text-muted">{{ roleLabel(m.role.name) }} · {{ m.user.email }}</p>
          </div>
          <UButton
            v-if="can(Permission.kick) && m.role.name !== 'owner'"
            size="xs"
            color="error"
            variant="ghost"
            label="Kick"
            @click="kickId = m.user.id"
          />
        </li>
      </ul>
    </template>

    <template v-else-if="section === 'invites'">
      <h1 class="text-xl font-semibold text-highlighted">Invites</h1>
      <p class="mt-1 text-sm text-muted">Anyone with a link can join this workspace.</p>
      <div class="mt-6 flex gap-2 max-w-xl">
        <UInput :model-value="inviteUrl" readonly class="flex-1" placeholder="Create an invite to get a link" />
        <UButton v-if="inviteUrl" label="Copy" @click="copyInvite()" />
        <UButton v-if="can(Permission.invite)" :loading="inviting" label="Create Invite" @click="makeInvite" />
      </div>
      <ul v-if="invitesQ.data.value?.invites.length" class="mt-8 divide-y divide-default">
        <li v-for="inv in invitesQ.data.value.invites" :key="inv.code" class="flex items-center gap-3 py-3">
          <div class="min-w-0 flex-1">
            <p class="font-mono text-sm text-highlighted truncate">{{ inv.code }}</p>
            <p class="text-xs text-muted">
              {{ inv.uses }}{{ inv.maxUses ? ` / ${inv.maxUses}` : '' }} uses
              · {{ inv.expiresAt ? `expires ${formatDateTime(inv.expiresAt)}` : 'never expires' }}
            </p>
          </div>
          <UButton size="xs" color="neutral" variant="soft" label="Copy" @click="copyInvite(inv.url)" />
        </li>
      </ul>
    </template>

    <template v-else>
      <h1 class="text-xl font-semibold text-highlighted">Audit Log</h1>
      <USkeleton v-if="auditQ.isPending.value" class="h-40 mt-6" />
      <UAlert v-else-if="auditQ.error.value" color="error" title="Need manage permission." class="mt-6" />
      <UAlert v-else-if="!auditQ.data.value?.entries.length" color="neutral" title="Nothing yet." class="mt-6" />
      <UTable v-else class="mt-6" :data="auditQ.data.value.entries" :columns="columns" />
    </template>
  </SettingsOverlay>

  <UModal :open="Boolean(kickId)" title="Kick this member?" @update:open="(v: boolean) => { if (!v) kickId = null }">
    <template #footer>
      <UButton color="neutral" variant="outline" label="Cancel" @click="kickId = null" />
      <UButton color="error" label="Kick" @click="confirmKick" />
    </template>
  </UModal>
</template>
