<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import type { AgentDTO } from '~~/shared/types'

const props = defineProps<{ workspaceId: string }>()
const toast = useToast()
const qc = useQueryClient()
const selectedAgentId = shallowRef<string | null>(null)
const creatingNew = ref(false)
const saving = ref(false)

const agentsQ = useQuery({
  queryKey: computed(() => ['agents', props.workspaceId]),
  queryFn: () => $fetch<{ agents: AgentDTO[] }>(`/api/workspaces/${props.workspaceId}/agents`),
})
const agents = computed(() => agentsQ.data.value?.agents ?? [])

const modelOptions = [
  { id: '@cf/moonshotai/kimi-k2.7-code', label: 'Kimi K2.7 Code', description: 'Coding · reasoning · tools' },
  { id: '@cf/zai-org/glm-5.2', label: 'GLM 5.2', description: 'Agentic coding · reasoning · tools' },
  { id: '@cf/qwen/qwen3-30b-a3b-fp8', label: 'Qwen3 30B A3B', description: 'Fast · reasoning · tools' },
  { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', label: 'Llama 3.3 70B Fast', description: 'General · fast · tools' },
]
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

const selectedAgent = computed(() => agents.value.find(agent => agent.id === selectedAgentId.value) ?? null)
const isNew = computed(() => creatingNew.value || !selectedAgent.value)

function modelOption(value: unknown) {
  return modelOptions.find(option => option.id === value)
}

function selectAgent(agent: AgentDTO) {
  creatingNew.value = false
  selectedAgentId.value = agent.id
  Object.assign(form, {
    displayName: agent.displayName,
    model: agent.model,
    instructions: agent.instructions,
    status: agent.status,
  })
}

function createAgent() {
  creatingNew.value = true
  selectedAgentId.value = null
  Object.assign(form, {
    displayName: '',
    model: '@cf/moonshotai/kimi-k2.7-code',
    instructions: '',
    status: 'active',
  })
}

watch(agents, (list) => {
  if (!list.length) return
  if (creatingNew.value) return
  const selected = list.find(agent => agent.id === selectedAgentId.value) ?? list[0]
  if (selected) selectAgent(selected)
}, { immediate: true })

async function saveAgent(event: FormSubmitEvent<AgentForm>) {
  saving.value = true
  try {
    let result: { agent: AgentDTO }
    if (selectedAgent.value) {
      result = await $fetch<{ agent: AgentDTO }>(`/api/workspaces/${props.workspaceId}/agents/${selectedAgent.value.id}`, {
        method: 'PATCH',
        body: event.data,
      })
      toast.add({ title: 'Agent updated', color: 'success' })
    }
    else {
      result = await $fetch<{ agent: AgentDTO }>(`/api/workspaces/${props.workspaceId}/agents`, {
        method: 'POST',
        body: {
          displayName: event.data.displayName,
          model: event.data.model,
          instructions: event.data.instructions,
        },
      })
      toast.add({ title: 'Agent created', color: 'success' })
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['agents', props.workspaceId] }),
      qc.invalidateQueries({ queryKey: ['members', props.workspaceId] }),
    ])
    selectAgent(result.agent)
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
  <div class="flex items-center justify-between gap-3">
    <h1 class="text-xl font-semibold text-highlighted">Agents</h1>
    <UButton icon="i-ph-plus" label="Add agent" size="sm" @click="createAgent" />
  </div>

  <USkeleton v-if="agentsQ.isPending.value" class="h-64 mt-6" />
  <UAlert v-else-if="agentsQ.error.value" color="error" title="Could not load agents." class="mt-6" />
  <div v-else class="mt-6 grid min-h-[520px] gap-6 lg:grid-cols-[210px_minmax(0,1fr)]">
    <div class="space-y-1">
      <button
        v-for="agent in agents"
        :key="agent.id"
        type="button"
        class="w-full rounded-md px-3 py-2 text-start hover:bg-elevated"
        :class="selectedAgentId === agent.id && !creatingNew ? 'bg-accented text-highlighted' : 'text-muted'"
        @click="selectAgent(agent)"
      >
        <span class="block truncate text-sm font-medium">{{ agent.displayName }}</span>
        <span class="block truncate text-xs text-muted">{{ agent.status }} · {{ modelOption(agent.model)?.label ?? agent.model }}</span>
      </button>
      <p v-if="!agents.length" class="px-3 py-2 text-sm text-muted">No agents</p>
    </div>

    <UForm :schema="schema" :state="form" class="min-w-0 max-w-2xl space-y-5" @submit="saveAgent">
      <UFormField name="displayName" label="Name">
        <UInput v-model="form.displayName" class="w-full" />
      </UFormField>

      <UFormField name="model" label="Model" hint="Workers AI">
        <USelect
          v-model="form.model"
          :items="modelOptions"
          value-key="id"
          label-key="label"
          class="w-full"
        />
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

      <UButton type="submit" :label="isNew ? 'Create agent' : 'Save changes'" :loading="saving" />
    </UForm>
  </div>
</template>
