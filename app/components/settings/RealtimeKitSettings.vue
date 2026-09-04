<script setup lang="ts">
import type { Form, FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'
import type { RealtimeKitSettingsAdminDTO } from '~~/shared/types'

const props = defineProps<{ workspaceId: string }>()
const toast = useToast()
const loading = ref(true)
const saving = ref(false)
const testing = ref(false)
const revealingApiToken = ref(false)
const removeConfirm = ref(false)
const showApiToken = ref(false)
const realtimekit = ref<RealtimeKitSettingsAdminDTO | null>(null)

const schema = z.object({
  accountId: z.string().trim().regex(/^[a-f0-9]{32}$/iu, 'Enter a 32-character Cloudflare account ID'),
  appId: z.string().trim().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu, 'Enter a RealtimeKit app UUID'),
  apiToken: z.string().max(4000),
  voicePreset: z.string().trim().min(1, 'Required').max(100),
  avPreset: z.string().trim().min(1, 'Required').max(100),
})
const form = useTemplateRef<Form<typeof schema>>('form')
type Schema = z.output<typeof schema>
const state = reactive<Schema>({
  accountId: '',
  appId: '',
  apiToken: '',
  voicePreset: 'voice',
  avPreset: 'group_call_host',
})

const managed = computed(() => realtimekit.value?.source === 'deployment')
const canRevealApiToken = computed(() => (
  realtimekit.value?.source === 'database'
  && realtimekit.value.apiTokenConfigured
  && realtimekit.value.secretReadable
))
const statusLabel = computed(() => {
  if (realtimekit.value?.configured) return 'Configured'
  if (realtimekit.value?.source === 'database' && !realtimekit.value.secretReadable) return 'Replace API token'
  return 'Not configured'
})
const statusColor = computed(() => realtimekit.value?.configured ? 'success' : 'neutral')

function apply(value: RealtimeKitSettingsAdminDTO) {
  realtimekit.value = value
  state.accountId = value.accountId ?? ''
  state.appId = value.appId ?? ''
  state.apiToken = ''
  showApiToken.value = false
  state.voicePreset = value.voicePreset
  state.avPreset = value.avPreset
}

async function load() {
  loading.value = true
  try {
    const response = await $fetch<{ realtimekit: RealtimeKitSettingsAdminDTO }>(`/api/workspaces/${props.workspaceId}/realtimekit`)
    apply(response.realtimekit)
  }
  catch (error) {
    toast.add({ title: errorMessage(error), color: 'error' })
  }
  finally {
    loading.value = false
  }
}

async function save(event: FormSubmitEvent<Schema>) {
  saving.value = true
  try {
    const response = await $fetch<{ realtimekit: RealtimeKitSettingsAdminDTO }>(`/api/workspaces/${props.workspaceId}/realtimekit`, {
      method: 'PATCH',
      body: event.data,
    })
    apply(response.realtimekit)
    toast.add({ title: 'RealtimeKit updated', color: 'success' })
  }
  catch (error) {
    toast.add({ title: errorMessage(error), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

async function toggleApiTokenVisibility() {
  if (showApiToken.value) {
    showApiToken.value = false
    return
  }
  if (state.apiToken) {
    showApiToken.value = true
    return
  }
  if (!canRevealApiToken.value) return

  revealingApiToken.value = true
  try {
    const response = await $fetch<{ apiToken: string }>(`/api/workspaces/${props.workspaceId}/realtimekit/reveal`, {
      method: 'POST',
    })
    state.apiToken = response.apiToken
    showApiToken.value = true
  }
  catch (error) {
    toast.add({ title: errorMessage(error), color: 'error' })
  }
  finally {
    revealingApiToken.value = false
  }
}

async function testConnection() {
  let data: Partial<Schema> = {}
  if (!managed.value) {
    try {
      const validated = await form.value?.validate({ transform: true })
      if (!validated) return
      data = validated
    }
    catch {
      return
    }
  }

  testing.value = true
  try {
    const response = await $fetch<{ ok: true, presets: string[] }>(`/api/workspaces/${props.workspaceId}/realtimekit/test`, {
      method: 'POST',
      body: data,
    })
    toast.add({
      title: 'RealtimeKit connected',
      description: `${response.presets.length} presets available`,
      color: 'success',
    })
  }
  catch (error) {
    toast.add({ title: errorMessage(error), color: 'error' })
  }
  finally {
    testing.value = false
  }
}

async function remove() {
  saving.value = true
  try {
    const response = await $fetch<{ realtimekit: RealtimeKitSettingsAdminDTO }>(`/api/workspaces/${props.workspaceId}/realtimekit`, {
      method: 'PATCH',
      body: { remove: true },
    })
    apply(response.realtimekit)
    removeConfirm.value = false
    toast.add({ title: 'RealtimeKit removed', color: 'success' })
  }
  catch (error) {
    toast.add({ title: errorMessage(error), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="flex items-center gap-3">
      <h1 class="text-xl font-semibold text-highlighted">Huddles</h1>
      <UBadge :label="statusLabel" :color="statusColor" variant="subtle" />
      <UButton
        class="ms-auto"
        label="RealtimeKit dashboard"
        icon="i-ph-arrow-square-out"
        color="neutral"
        variant="ghost"
        to="https://dash.cloudflare.com/?to=/:account/realtime/kit"
        target="_blank"
      />
    </div>

    <USkeleton v-if="loading" class="mt-6 h-64 w-full" />
    <template v-else-if="realtimekit">
      <UAlert v-if="managed" class="mt-6" color="neutral" variant="subtle" title="Managed by deployment" />
      <UAlert
        v-else-if="realtimekit.source === 'database' && !realtimekit.secretReadable"
        class="mt-6"
        color="error"
        variant="subtle"
        title="Saved API token cannot be decrypted. Replace it."
      />

      <UForm ref="form" :schema="schema" :state="state" class="mt-6 space-y-5" @submit="save">
        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField name="accountId" label="Account ID" required>
            <UInput v-model="state.accountId" class="w-full" :disabled="managed" autocomplete="off" />
          </UFormField>
          <UFormField name="appId" label="App ID" required>
            <UInput v-model="state.appId" class="w-full" :disabled="managed" autocomplete="off" />
          </UFormField>
        </div>

        <UFormField name="apiToken" label="API token" :required="!realtimekit.apiTokenConfigured">
          <UInput
            v-model="state.apiToken"
            class="w-full"
            :type="showApiToken ? 'text' : 'password'"
            :disabled="managed"
            :placeholder="managed ? 'Managed by deployment' : realtimekit.apiTokenConfigured ? 'Saved; reveal or enter to replace' : ''"
            autocomplete="new-password"
          >
            <template #trailing>
              <UButton
                v-if="state.apiToken || canRevealApiToken"
                type="button"
                :icon="showApiToken ? 'i-ph-eye-slash' : 'i-ph-eye'"
                :aria-label="showApiToken ? 'Hide API token' : 'Show API token'"
                color="neutral"
                variant="link"
                size="sm"
                :loading="revealingApiToken"
                @click="toggleApiTokenVisibility"
              />
            </template>
          </UInput>
        </UFormField>

        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField name="voicePreset" label="Voice preset" required>
            <UInput v-model="state.voicePreset" class="w-full" :disabled="managed" />
          </UFormField>
          <UFormField name="avPreset" label="Audio and video preset" required>
            <UInput v-model="state.avPreset" class="w-full" :disabled="managed" />
          </UFormField>
        </div>

        <div class="flex items-center justify-between gap-3">
          <div v-if="!managed && realtimekit.source === 'database'" class="flex items-center gap-2">
            <template v-if="removeConfirm">
              <UButton label="Cancel" color="neutral" variant="ghost" @click="removeConfirm = false" />
              <UButton label="Confirm removal" color="error" variant="soft" :loading="saving" @click="remove" />
            </template>
            <UButton v-else label="Remove configuration" color="error" variant="ghost" @click="removeConfirm = true" />
          </div>
          <span v-else />
          <div class="flex items-center gap-2">
            <UButton
              type="button"
              label="Test connection"
              icon="i-ph-plugs-connected"
              color="neutral"
              variant="soft"
              :loading="testing"
              @click="testConnection"
            />
            <UButton v-if="!managed" type="submit" label="Save changes" :loading="saving" />
          </div>
        </div>
      </UForm>
    </template>
  </div>
</template>
