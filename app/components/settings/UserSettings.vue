<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

type Section = 'account' | 'profile' | 'privacy' | 'appearance' | 'notifications' | 'voice' | 'chat'

const open = defineModel<boolean>('open', { default: false })

const session = useSessionStore()
const { api } = useApi()
const huddle = useHuddleStore()
const prefs = usePrefsStore()
const push = usePushNotifications()
const toast = useToast()
const colorMode = useColorMode()
const section = ref<Section>('account')
const revealEmail = ref(false)
const savingName = ref(false)
const accountProviders = ref<string[]>([])
const hasPassword = computed(() => accountProviders.value.includes('credential'))

const schema = z.object({ displayName: z.string().min(1).max(80) })
type Schema = z.output<typeof schema>
const state = reactive<Partial<Schema>>({ displayName: session.user?.displayName || '' })

const password = reactive({ current: '', next: '', confirm: '' })
const savingPassword = ref(false)

const inputId = ref('')
const outputId = ref('')
const inputs = ref<{ label: string; value: string }[]>([])
const outputs = ref<{ label: string; value: string }[]>([])
const micBusy = ref(false)

watch(open, async (v) => {
  if (v) {
    section.value = 'account'
    state.displayName = session.user?.displayName || ''
    password.current = ''
    password.next = ''
    password.confirm = ''
    revealEmail.value = false
    try {
      accountProviders.value = (await $fetch<{ providers: string[] }>('/api/auth/accounts')).providers
    }
    catch {
      accountProviders.value = []
    }
    await push.refresh()
  }
})

const userGroups = [
  { id: 'account' as const, label: 'My Account' },
  { id: 'profile' as const, label: 'Profile' },
  { id: 'privacy' as const, label: 'Privacy & Safety' },
]

const appGroups = [
  { id: 'appearance' as const, label: 'Appearance' },
  { id: 'notifications' as const, label: 'Notifications' },
  { id: 'voice' as const, label: 'Voice & Video' },
  { id: 'chat' as const, label: 'Chat' },
]

const initial = computed(() => (session.user?.displayName || '?').slice(0, 1).toUpperCase())
const email = computed(() => session.user?.email || '')
const maskedEmail = computed(() => {
  const [name, domain] = email.value.split('@')
  if (!name || !domain) return email.value
  return `${name[0]}${'*'.repeat(Math.max(name.length - 1, 4))}@${domain}`
})

const bannerStyle = computed(() => {
  const id = session.user?.id || ''
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * (i + 1)) % 360
  return { backgroundColor: `hsl(${h} 48% 38%)` }
})

const theme = computed({
  get: () => colorMode.preference || 'dark',
  set: (v: string) => { colorMode.preference = v },
})

const themes = [
  { label: 'Dark', value: 'dark', description: 'Default Discoflare look' },
  { label: 'Light', value: 'light', description: 'Bright surfaces' },
  { label: 'Sync with computer', value: 'system', description: 'Match the OS' },
]

async function onSaveName(event: FormSubmitEvent<Schema>) {
  savingName.value = true
  try {
    const res = await $fetch<{ user: { displayName: string } }>('/api/me', { method: 'PATCH', body: event.data })
    if (session.user) session.user.displayName = res.user.displayName
    toast.add({ title: 'Display name updated', color: 'success' })
  }
  catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
  finally {
    savingName.value = false
  }
}

async function onPassword() {
  if (password.next.length < 8) {
    toast.add({ title: 'New password must be at least 8 characters', color: 'error' })
    return
  }
  if (password.next !== password.confirm) {
    toast.add({ title: 'New passwords do not match', color: 'error' })
    return
  }
  savingPassword.value = true
  try {
    await $fetch('/api/auth/change-password', {
      method: 'POST',
      body: { currentPassword: password.current, newPassword: password.next },
    })
    toast.add({ title: 'Password updated', color: 'success' })
    password.current = ''
    password.next = ''
    password.confirm = ''
  }
  catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
  finally {
    savingPassword.value = false
  }
}

async function enableNotifications() {
  try {
    await push.enable()
    if (push.status.value === 'subscribed') toast.add({ title: 'Notifications enabled', color: 'success' })
    else if (push.status.value === 'blocked') toast.add({ title: 'Permission denied', color: 'warning' })
  }
  catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
}

async function disableNotifications() {
  try {
    await push.disable()
  }
  catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
}

async function loadDevices() {
  micBusy.value = true
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true })
    const list = await navigator.mediaDevices.enumerateDevices()
    inputs.value = list.filter((d) => d.kind === 'audioinput').map((d, i) => ({
      label: d.label || `Microphone ${i + 1}`,
      value: d.deviceId || `in-${i}`,
    }))
    outputs.value = list.filter((d) => d.kind === 'audiooutput').map((d, i) => ({
      label: d.label || `Speaker ${i + 1}`,
      value: d.deviceId || `out-${i}`,
    }))
    if (!inputId.value && inputs.value[0]) inputId.value = inputs.value[0].value
    if (!outputId.value && outputs.value[0]) outputId.value = outputs.value[0].value
  }
  catch {
    toast.add({ title: 'Microphone permission is required to list devices', color: 'warning' })
  }
  finally {
    micBusy.value = false
  }
}

async function logout() {
  await push.disable().catch(() => undefined)
  await session.logout(api)
  open.value = false
  await navigateTo('/login')
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
      <p class="px-2.5 mb-1 text-[11px] font-bold uppercase tracking-wide text-muted">User Settings</p>
      <nav class="space-y-0.5">
        <UButton
          v-for="item in userGroups"
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
      <p class="px-2.5 mb-1 text-[11px] font-bold uppercase tracking-wide text-muted">App Settings</p>
      <nav class="space-y-0.5">
        <UButton
          v-for="item in appGroups"
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
      <UButton
        label="Log Out"
        color="error"
        variant="ghost"
        block
        class="justify-start"
        @click="logout"
      />
    </template>

    <template v-if="section === 'account'">
      <h1 class="text-xl font-semibold text-highlighted mb-5">My Account</h1>
      <div class="rounded-lg overflow-hidden bg-elevated ring ring-default">
        <div class="h-[100px]" :style="bannerStyle" />
        <div class="relative px-4 pb-4">
          <div class="absolute -top-10 start-4 rounded-full ring-8 ring-[var(--ui-bg-elevated)]">
            <UAvatar size="3xl" :text="initial" :alt="session.user?.displayName" />
          </div>
          <div class="flex items-start justify-between gap-3 pt-2 ps-[88px] min-h-12">
            <p class="text-xl font-bold text-highlighted truncate">{{ session.user?.displayName }}</p>
            <UButton size="sm" label="Edit User Profile" class="shrink-0" @click="section = 'profile'" />
          </div>
          <div class="mt-4 rounded-lg bg-muted p-4 space-y-4">
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="text-[11px] font-bold uppercase tracking-wide text-muted">Display Name</p>
                <p class="text-sm text-highlighted truncate">{{ session.user?.displayName }}</p>
              </div>
              <UButton size="xs" color="neutral" variant="soft" label="Edit" @click="section = 'profile'" />
            </div>
            <USeparator v-if="email" />
            <div v-if="email" class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="text-[11px] font-bold uppercase tracking-wide text-muted">Email</p>
                <p class="text-sm text-highlighted truncate">{{ revealEmail ? email : maskedEmail }}</p>
              </div>
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                :label="revealEmail ? 'Hide' : 'Reveal'"
                @click="revealEmail = !revealEmail"
              />
            </div>
          </div>
        </div>
      </div>

      <h2 v-if="hasPassword" class="mt-10 text-xs font-bold uppercase tracking-wide text-muted">Password and Authentication</h2>
      <div v-if="hasPassword" class="mt-3 max-w-sm space-y-3">
        <UFormField label="Current password">
          <UInput v-model="password.current" type="password" class="w-full" autocomplete="current-password" />
        </UFormField>
        <UFormField label="New password">
          <UInput v-model="password.next" type="password" class="w-full" autocomplete="new-password" />
        </UFormField>
        <UFormField label="Confirm new password">
          <UInput v-model="password.confirm" type="password" class="w-full" autocomplete="new-password" />
        </UFormField>
        <UButton label="Change Password" :loading="savingPassword" @click="onPassword" />
      </div>
    </template>

    <template v-else-if="section === 'profile'">
      <h1 class="text-xl font-semibold text-highlighted mb-5">Profiles</h1>
      <div class="grid gap-8 lg:grid-cols-[1fr_320px]">
        <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSaveName">
          <UFormField name="displayName" label="Display Name">
            <UInput v-model="state.displayName" class="w-full" />
          </UFormField>
          <p class="text-sm text-muted">This is how you appear in channels, DMs, and huddles.</p>
          <UButton type="submit" label="Save Changes" :loading="savingName" />
        </UForm>
        <div>
          <p class="text-[11px] font-bold uppercase tracking-wide text-muted mb-2">Preview</p>
          <div class="rounded-lg overflow-hidden bg-elevated ring ring-default">
            <div class="h-20" :style="bannerStyle" />
            <div class="px-4 pb-4">
              <div class="rounded-full ring-8 ring-[var(--ui-bg-elevated)] -mt-8 w-fit">
                <UAvatar size="xl" :text="initial" />
              </div>
              <p class="mt-3 text-lg font-bold text-highlighted">{{ state.displayName || session.user?.displayName }}</p>
              <p v-if="email" class="text-sm text-muted">{{ email }}</p>
              <USeparator class="my-3" />
              <p class="text-[11px] font-bold uppercase tracking-wide text-muted">Custom Status</p>
              <p class="text-sm text-muted mt-1">Online in this workspace</p>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template v-else-if="section === 'privacy'">
      <h1 class="text-xl font-semibold text-highlighted">Privacy & Safety</h1>
      <div class="mt-8 divide-y divide-default">
        <div class="flex items-start justify-between gap-6 py-4">
          <div>
            <p class="font-medium text-highlighted">Display current activity</p>
            <p class="text-sm text-muted mt-1">Show Online / Idle / Offline on the member list.</p>
          </div>
          <USwitch v-model="prefs.showOnline" />
        </div>
      </div>
    </template>

    <template v-else-if="section === 'appearance'">
      <h1 class="text-xl font-semibold text-highlighted">Appearance</h1>
      <p class="mt-1 text-sm text-muted">How Discoflare looks on this device.</p>
      <h2 class="mt-8 mb-3 text-xs font-bold uppercase tracking-wide text-muted">Theme</h2>
      <URadioGroup v-model="theme" variant="card" :items="themes" />
      <h2 class="mt-8 mb-3 text-xs font-bold uppercase tracking-wide text-muted">Message Display</h2>
      <div class="flex items-start justify-between gap-6 py-2">
        <div>
          <p class="font-medium text-highlighted">Compact mode</p>
          <p class="text-sm text-muted mt-1">Tighter message spacing. Consecutive messages still group together.</p>
        </div>
        <USwitch v-model="prefs.compact" />
      </div>
    </template>

    <template v-else-if="section === 'notifications'">
      <h1 class="text-xl font-semibold text-highlighted">Notifications</h1>
      <div class="mt-8 divide-y divide-default">
        <div class="flex items-start justify-between gap-6 py-4">
          <div>
            <p class="font-medium text-highlighted">Push notifications</p>
            <p class="text-sm text-muted mt-1">Mentions, direct messages, and new huddles on this device.</p>
          </div>
          <UButton
            v-if="push.status.value === 'prompt' || push.status.value === 'error'"
            size="sm"
            label="Enable"
            :loading="push.busy.value"
            @click="enableNotifications"
          />
          <USwitch
            v-else-if="push.status.value === 'subscribed'"
            :model-value="true"
            :disabled="push.busy.value"
            @update:model-value="disableNotifications"
          />
          <UBadge
            v-else
            color="neutral"
            variant="soft"
            :label="push.status.value === 'blocked' ? 'Blocked' : push.status.value === 'unconfigured' ? 'Unavailable' : 'Unsupported'"
          />
        </div>
        <div class="flex items-start justify-between gap-6 py-4">
          <div>
            <p class="font-medium text-highlighted">Message sounds</p>
            <p class="text-sm text-muted mt-1">Play a sound when a message arrives while the tab is in the background.</p>
          </div>
          <USwitch v-model="prefs.messageSounds" />
        </div>
      </div>
    </template>

    <template v-else-if="section === 'voice'">
      <h1 class="text-xl font-semibold text-highlighted">Voice & Video</h1>
      <p class="mt-1 text-sm text-muted">Huddles use your browser microphone. Mute and deafen also live on the account panel.</p>
      <div class="mt-8 space-y-6 max-w-md">
        <div class="flex gap-2">
          <UButton
            :color="huddle.muted ? 'error' : 'neutral'"
            :variant="huddle.muted ? 'soft' : 'outline'"
            :icon="huddle.muted ? 'i-ph-microphone-slash' : 'i-ph-microphone'"
            :label="huddle.muted ? 'Unmute' : 'Mute'"
            @click="huddle.toggleMute()"
          />
          <UButton
            :color="huddle.deafened ? 'error' : 'neutral'"
            :variant="huddle.deafened ? 'soft' : 'outline'"
            :icon="huddle.deafened ? 'i-ph-speaker-slash' : 'i-ph-headphones'"
            :label="huddle.deafened ? 'Undeafen' : 'Deafen'"
            @click="huddle.toggleDeafen()"
          />
        </div>
        <UFormField label="Input Device">
          <USelect v-if="inputs.length" v-model="inputId" :items="inputs" class="w-full" />
          <UButton v-else :loading="micBusy" color="neutral" variant="outline" label="Grant microphone access" @click="loadDevices" />
        </UFormField>
        <UFormField v-if="outputs.length" label="Output Device">
          <USelect v-model="outputId" :items="outputs" class="w-full" />
        </UFormField>
      </div>
    </template>

    <template v-else>
      <h1 class="text-xl font-semibold text-highlighted">Chat</h1>
      <div class="mt-8 divide-y divide-default">
        <div class="flex items-start justify-between gap-6 py-4">
          <div>
            <p class="font-medium text-highlighted">Compact mode</p>
            <p class="text-sm text-muted mt-1">Same control as Appearance. Tighter spacing in the transcript.</p>
          </div>
          <USwitch v-model="prefs.compact" />
        </div>
        <div class="py-4">
          <p class="font-medium text-highlighted">Send Message</p>
          <p class="text-sm text-muted mt-1">Enter to send. Shift+Enter for a new line. Arrow up edits your last message.</p>
        </div>
        <div class="py-4">
          <p class="font-medium text-highlighted">Markdown</p>
          <p class="text-sm text-muted mt-1">Messages support a small markdown subset: bold, italic, code, links, and lists.</p>
        </div>
      </div>
    </template>
  </SettingsOverlay>
</template>
