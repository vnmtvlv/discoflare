<script setup lang="ts">
import type { ProgressState, Workspace } from '../composables/useAdmin'

type Result = { url: string, setupUrl?: string, version: string }

const props = defineProps<{ workspaces: Workspace[] }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ created: [] }>()

const STEPS = [
  { id: 'account', label: 'Check the Cloudflare account' },
  { id: 'installation', label: 'Reserve the workspace' },
  { id: 'storage', label: 'Create D1, R2, and KV storage' },
  { id: 'database', label: 'Apply database migrations' },
  { id: 'assets', label: 'Upload the app' },
  { id: 'access', label: 'Configure sign-in' },
  { id: 'worker', label: 'Deploy the Worker' },
  { id: 'domain', label: 'Enable the workers.dev address' },
  { id: 'schedule', label: 'Schedule maintenance' },
  { id: 'verify', label: 'Verify workspace health' },
] as const

const appName = ref('')
const workerName = ref('')
const edited = ref(false)
const phase = ref<'form' | 'working' | 'done'>('form')
const steps = ref<Record<string, ProgressState>>({})
const error = ref('')
const result = ref<Result | null>(null)

function slug(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 63).replace(/-+$/u, '')
}

watch(open, (value) => {
  if (!value || phase.value === 'working') return
  phase.value = 'form'
  error.value = ''
  result.value = null
  steps.value = {}
  appName.value = ''
  workerName.value = ''
  edited.value = false
})

watch(appName, (value) => {
  if (!edited.value) workerName.value = slug(value)
})

const subdomain = computed(() => {
  for (const workspace of props.workspaces) {
    const match = /^[^.]+\.([^.]+)\.workers\.dev$/u.exec(new URL(workspace.origin).hostname)
    if (match) return match[1]
  }
  return ''
})

const nameError = computed(() => {
  const name = workerName.value
  if (!name) return ''
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(name)) return 'Use lowercase letters, numbers, and hyphens.'
  if (name === 'discoflare-admin') return 'That address belongs to the Admin.'
  if (props.workspaces.some(workspace => workspace.workerName === name)) return 'A workspace with this address already exists.'
  return ''
})

const canSubmit = computed(() => Boolean(appName.value.trim() && workerName.value && !nameError.value))

async function create() {
  if (!canSubmit.value) return
  phase.value = 'working'
  error.value = ''
  steps.value = {}
  try {
    result.value = await streamProgress<Result>('/api/workspaces', { appName: appName.value.trim(), workerName: workerName.value }, (step, state) => {
      steps.value = { ...steps.value, [step]: state }
    })
    phase.value = 'done'
  }
  catch (cause) {
    error.value = failureMessage(cause, 'The workspace could not be created')
    phase.value = 'form'
  }
  finally {
    emit('created')
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="phase === 'done' ? 'Workspace ready' : 'New workspace'"
    :dismissible="phase !== 'working'"
    :close="phase !== 'working'"
  >
    <template #body>
      <form v-if="phase === 'form'" id="create-workspace" class="space-y-5" @submit.prevent="create">
        <UAlert v-if="error" color="error" title="Creation stopped" :description="error" />
        <UFormField label="Workspace name" required>
          <UInput v-model="appName" maxlength="80" placeholder="Acme" autofocus class="w-full" />
        </UFormField>
        <UFormField label="Address" :error="nameError || undefined" required>
          <UInput v-model="workerName" maxlength="63" placeholder="acme" class="w-full" @update:model-value="edited = true" />
          <template #help>
            <span class="break-all">https://<span class="text-highlighted">{{ workerName || 'acme' }}</span>.{{ subdomain || 'your-subdomain' }}.workers.dev</span>
            <span class="mt-1 block">Also the Worker name in Cloudflare. It can't be changed later.</span>
          </template>
        </UFormField>
        <p class="text-sm text-muted">The workspace starts invite-only on workers.dev. Connect domains, email, and Live from its Workspace Settings.</p>
      </form>
      <div v-else-if="phase === 'working'" class="space-y-5">
        <ProgressList :steps="STEPS" :state="steps" />
        <p class="text-xs text-dimmed">This usually takes one to three minutes. Keep this tab open.</p>
      </div>
      <div v-else-if="result" class="space-y-4">
        <p class="font-medium text-highlighted">{{ appName }} is running on Discoflare {{ result.version }}.</p>
        <ULink :to="result.url" target="_blank" class="block truncate text-sm text-primary">{{ result.url }}</ULink>
        <p v-if="result.setupUrl" class="text-sm text-muted">Next, create the workspace owner. The private setup link works once; you can issue a new one from the workspace page.</p>
      </div>
    </template>
    <template v-if="phase !== 'working'" #footer>
      <template v-if="phase === 'form'">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="open = false" />
        <UButton type="submit" form="create-workspace" label="Create workspace" :disabled="!canSubmit" />
      </template>
      <template v-else-if="result">
        <UButton label="Done" color="neutral" variant="ghost" @click="open = false" />
        <UButton :to="result.setupUrl || result.url" external target="_blank" :label="result.setupUrl ? 'Continue to owner setup' : 'Open workspace'" trailing-icon="i-ph-arrow-up-right" />
      </template>
    </template>
  </UModal>
</template>
