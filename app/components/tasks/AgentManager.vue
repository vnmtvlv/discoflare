<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import type { AgentDTO } from '~~/shared/types'

const props = defineProps<{
  agents: AgentDTO[]
  workspaceId: string
  initialAgentId?: string | null
}>()

const emit = defineEmits<{
  saved: []
}>()

const open = defineModel<boolean>('open', { default: false })
const toast = useToast()
const selectedAgentId = shallowRef<string | null>(null)
const saving = ref(false)

const modelOptions = [
  { id: '@cf/moonshotai/kimi-k2.7-code', label: 'Kimi K2.7 Code', description: 'Coding · reasoning · tools' },
  { id: '@cf/zai-org/glm-5.2', label: 'GLM 5.2', description: 'Agentic coding · reasoning · tools' },
  { id: '@cf/qwen/qwen3-30b-a3b-fp8', label: 'Qwen3 30B A3B', description: 'Fast · reasoning · tools' },
  { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', label: 'Llama 3.3 70B Fast', description: 'General · fast · tools' },
] as const
const modelIds: string[] = modelOptions.map(option => option.id)
const statusOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Paused', value: 'paused' },
]

const schema = z.object({
  displayName: z.string().trim().min(1, 'Enter a name').max(80),
  model: z.string().trim().min(1, 'Choose a model').max(200),
  instructions: z.string().trim().max(12_000),
  status: z.enum(['active', 'paused']),
})
type AgentForm = z.output<typeof schema>

const form = reactive<AgentForm>({
  displayName: '',
  model: '@cf/moonshotai/kimi-k2.7-code',
  instructions: '',
  status: 'active',
})

const selectedAgent = computed(() => props.agents.find(agent => agent.id === selectedAgentId.value) ?? null)
const isNew = computed(() => selectedAgentId.value === null)

function modelOption(value: unknown) {
  return modelOptions.find(option => option.id === value)
}

function resetForm() {
  Object.assign(form, {
    displayName: '',
    model: '@cf/moonshotai/kimi-k2.7-code',
    instructions: '',
    status: 'active',
  })
}

function selectAgent(agent: AgentDTO) {
  selectedAgentId.value = agent.id
  Object.assign(form, {
    displayName: agent.displayName,
    model: agent.model,
    instructions: agent.instructions,
    status: agent.status,
  })
}

function createAgent() {
  selectedAgentId.value = null
  resetForm()
}

watch([open, () => props.initialAgentId, () => props.agents], ([isOpen, initialAgentId]) => {
  if (!isOpen) return
  const agent = props.agents.find(item => item.id === initialAgentId)
    ?? props.agents.find(item => item.id === selectedAgentId.value)
    ?? props.agents[0]
  if (agent) selectAgent(agent)
  else createAgent()
})

async function saveAgent(event: FormSubmitEvent<AgentForm>) {
  saving.value = true
  try {
    if (selectedAgentId.value) {
      await $fetch(`/api/workspaces/${props.workspaceId}/agents/${selectedAgentId.value}`, {
        method: 'PATCH',
        body: event.data,
      })
      toast.add({ title: 'Agent updated', color: 'success' })
    }
    else {
      await $fetch(`/api/workspaces/${props.workspaceId}/agents`, {
        method: 'POST',
        body: {
          displayName: event.data.displayName,
          model: event.data.model,
          instructions: event.data.instructions,
        },
      })
      toast.add({ title: 'Agent created', color: 'success' })
    }
    emit('saved')
    open.value = false
  }
  catch (error) {
    toast.add({ title: errorMessage(error), color: 'error' })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <USlideover v-model:open="open" title="Agents">
    <template #body>
      <div class="flex gap-2 overflow-x-auto pb-1">
        <UButton
          icon="i-ph-plus"
          label="New"
          color="neutral"
          :variant="isNew ? 'soft' : 'ghost'"
          @click="createAgent"
        />
        <UButton
          v-for="agent in agents"
          :key="agent.id"
          :label="agent.displayName"
          color="neutral"
          :variant="selectedAgentId === agent.id ? 'soft' : 'ghost'"
          @click="selectAgent(agent)"
        />
      </div>

      <UForm id="agent-profile-form" :schema="schema" :state="form" class="mt-6 space-y-5" @submit="saveAgent">
        <UFormField name="displayName" label="Name">
          <UInput v-model="form.displayName" autofocus class="w-full" />
        </UFormField>

        <UFormField name="model" label="Model" hint="Workers AI">
          <UInputMenu v-model="form.model" :items="modelIds" mode="autocomplete" class="w-full">
            <template #item="{ item }">
              <div class="min-w-0">
                <div class="truncate font-medium">{{ modelOption(item)?.label ?? item }}</div>
                <div class="truncate text-xs text-muted">{{ modelOption(item)?.description ?? item }}</div>
              </div>
            </template>
          </UInputMenu>
        </UFormField>

        <UFormField name="instructions" label="Profile instructions">
          <UTextarea v-model="form.instructions" :rows="10" autoresize :maxrows="18" class="w-full" />
        </UFormField>

        <UFormField v-if="selectedAgent" name="status" label="Status">
          <USelect v-model="form.status" :items="statusOptions" class="w-full" />
        </UFormField>

        <dl v-if="selectedAgent" class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-default pt-5 text-sm">
          <dt class="text-muted">Computer</dt>
          <dd class="truncate font-mono text-xs">{{ selectedAgent.sandboxId }}</dd>
          <dt class="text-muted">Last active</dt>
          <dd>{{ selectedAgent.lastActiveAt ? new Date(selectedAgent.lastActiveAt).toLocaleString() : 'Never' }}</dd>
        </dl>
      </UForm>
    </template>

    <template #footer="{ close }">
      <UButton color="neutral" variant="ghost" label="Cancel" @click="close" />
      <UButton
        type="submit"
        form="agent-profile-form"
        :label="isNew ? 'Create agent' : 'Save changes'"
        :loading="saving"
      />
    </template>
  </USlideover>
</template>
