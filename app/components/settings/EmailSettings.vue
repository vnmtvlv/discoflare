<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { MailSettingsDTO, MailboxPermission, MemberDTO } from '~~/shared/types'

const props = defineProps<{ workspaceId: string }>()
const toast = useToast()
const qc = useQueryClient()
const selectedId = ref<string | null>(null)
const localPart = ref('')
const displayName = ref('')
const creating = ref(false)
const saving = ref(false)
const enabled = ref(true)
const grants = reactive<Record<string, 'none' | MailboxPermission>>({})

const mailQ = useQuery({
  queryKey: computed(() => ['mail-settings', props.workspaceId]),
  queryFn: () => $fetch<{ mail: MailSettingsDTO }>(`/api/workspaces/${props.workspaceId}/mail`),
})
const membersQ = useQuery({
  queryKey: computed(() => ['members', props.workspaceId]),
  queryFn: () => $fetch<{ members: MemberDTO[] }>(`/api/workspaces/${props.workspaceId}/members`),
})
const mail = computed(() => mailQ.data.value?.mail)
const mailboxes = computed(() => mail.value?.mailboxes ?? [])
const selected = computed(() => mailboxes.value.find(mailbox => mailbox.channelId === selectedId.value) ?? null)
const ownerId = computed(() => membersQ.data.value?.members.find(member => member.role.key === 'owner')?.user.id ?? null)
const permissionOptions = [
  { label: 'No access', value: 'none' },
  { label: 'Read only', value: 'read' },
  { label: 'Read and send', value: 'send' },
  { label: 'Manage', value: 'manage' },
]

watch(mailboxes, (items) => {
  if (!selectedId.value || !items.some(item => item.channelId === selectedId.value)) selectedId.value = items[0]?.channelId ?? null
}, { immediate: true })

watch(selected, (mailbox) => {
  displayName.value = mailbox?.displayName || ''
  enabled.value = mailbox?.enabled ?? true
  for (const key of Object.keys(grants)) grants[key] = 'none'
  for (const member of membersQ.data.value?.members ?? []) grants[member.user.id] = 'none'
  for (const access of mailbox?.access ?? []) grants[access.userId] = access.permission
}, { immediate: true })

watch(() => membersQ.data.value?.members, (members) => {
  for (const member of members ?? []) if (!(member.user.id in grants)) grants[member.user.id] = 'none'
}, { immediate: true })

function accessPayload() {
  return Object.entries(grants)
    .filter((entry): entry is [string, MailboxPermission] => entry[1] !== 'none')
    .map(([userId, permission]) => ({ userId, permission }))
}

async function createMailbox() {
  if (!localPart.value.trim() || !mail.value?.domain) return
  creating.value = true
  try {
    await $fetch(`/api/workspaces/${props.workspaceId}/mailboxes`, {
      method: 'POST',
      body: { localPart: localPart.value, displayName: localPart.value, access: [] },
    })
    localPart.value = ''
    await Promise.all([
      mailQ.refetch(),
      qc.invalidateQueries({ queryKey: ['mailboxes'] }),
    ])
    toast.add({ title: 'Mailbox created', color: 'success' })
  }
  catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
  finally { creating.value = false }
}

async function saveMailbox() {
  if (!selected.value || !displayName.value.trim()) return
  saving.value = true
  try {
    await $fetch(`/api/workspaces/${props.workspaceId}/mailboxes/${selected.value.channelId}`, {
      method: 'PATCH',
      body: { displayName: displayName.value.trim(), enabled: enabled.value, access: accessPayload() },
    })
    await Promise.all([
      mailQ.refetch(),
      qc.invalidateQueries({ queryKey: ['mailboxes'] }),
    ])
    toast.add({ title: 'Mailbox updated', color: 'success' })
  }
  catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
  finally { saving.value = false }
}
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold text-highlighted">Email</h1>
    <UAlert v-if="mailQ.isPending.value" color="neutral" title="Loading email settings" class="mt-6" />
    <UAlert
      v-else-if="!mail?.configured"
      color="warning"
      title="Email is not connected"
      description="Reconnect through the Discoflare installer to select a Cloudflare domain."
      class="mt-6"
    />
    <template v-else>
      <div class="mt-6 grid gap-3 sm:grid-cols-2">
        <div class="rounded-lg border border-default p-4">
          <p class="text-xs text-muted">Mail domain</p>
          <p class="mt-1 font-medium text-highlighted">{{ mail.domain }}</p>
        </div>
        <div class="rounded-lg border border-default p-4">
          <p class="text-xs text-muted">Discoflare address</p>
          <p class="mt-1 font-medium text-highlighted">{{ mail.appHostname }}</p>
        </div>
      </div>
      <UAlert v-if="!mail.sendingBound" color="warning" title="Sending is unavailable" description="Run the installer again to add the workspace mail binding." class="mt-4" />

      <div class="mt-8 flex gap-2">
        <UFormField label="New mailbox" class="min-w-0 flex-1">
          <UInput v-model="localPart" class="w-full" placeholder="support">
            <template #trailing><span class="text-xs text-muted">@{{ mail.domain }}</span></template>
          </UInput>
        </UFormField>
        <UButton class="mt-6" label="Create" icon="i-ph-plus" :loading="creating" :disabled="!localPart.trim()" @click="createMailbox" />
      </div>

      <div v-if="mailboxes.length" class="mt-8 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav class="space-y-1">
          <button
            v-for="mailbox in mailboxes"
            :key="mailbox.channelId"
            type="button"
            class="block w-full rounded-md px-3 py-2 text-start text-sm"
            :class="mailbox.channelId === selectedId ? 'bg-accented text-highlighted' : 'text-muted hover:bg-elevated'"
            @click="selectedId = mailbox.channelId"
          >
            <span class="block truncate font-medium">{{ mailbox.address }}</span>
            <span class="text-xs">{{ mailbox.enabled ? 'Active' : 'Paused' }}</span>
          </button>
        </nav>
        <div v-if="selected" class="min-w-0">
          <UFormField label="Display name">
            <UInput v-model="displayName" class="w-full" />
          </UFormField>
          <UCheckbox v-model="enabled" label="Receive email" class="mt-4" />
          <h2 class="mt-8 text-sm font-semibold text-highlighted">Access</h2>
          <div class="mt-2 divide-y divide-default">
            <div v-for="member in membersQ.data.value?.members ?? []" :key="member.user.id" class="flex items-center gap-3 py-3">
              <UserAvatar :user="member.user" size="sm" />
              <span class="min-w-0 flex-1 truncate text-sm text-default">{{ member.nickname || member.user.displayName }}</span>
              <USelect
                v-model="grants[member.user.id]"
                :items="permissionOptions"
                value-key="value"
                class="w-40"
                :disabled="member.user.id === ownerId"
              />
            </div>
          </div>
          <div class="mt-6 flex justify-end"><UButton label="Save changes" :loading="saving" @click="saveMailbox" /></div>
        </div>
      </div>
    </template>
  </div>
</template>
