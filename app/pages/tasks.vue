<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { AgentDTO, ChannelDTO, TaskBoardDTO, TaskDTO, TaskStatus } from '~~/shared/types'

definePageMeta({ middleware: ['auth'] })

const { workspaceId } = useWorkspace()
const qc = useQueryClient()
const toast = useToast()

const agentsQ = useQuery({
  queryKey: computed(() => ['agents', workspaceId.value]),
  queryFn: () => $fetch<{ agents: AgentDTO[] }>(`/api/workspaces/${workspaceId.value}/agents`),
  enabled: computed(() => Boolean(workspaceId.value)),
})
const boardsQ = useQuery({
  queryKey: computed(() => ['boards', workspaceId.value]),
  queryFn: () => $fetch<{ boards: TaskBoardDTO[] }>(`/api/workspaces/${workspaceId.value}/boards`),
  enabled: computed(() => Boolean(workspaceId.value)),
  refetchInterval: query => query.state.data?.boards.some(board => board.tasks.some(task => task.status === 'running')) ? 3000 : false,
})
const channelsQ = useQuery({
  queryKey: computed(() => ['channels', workspaceId.value]),
  queryFn: () => $fetch<{ channels: ChannelDTO[] }>(`/api/workspaces/${workspaceId.value}/channels`),
  enabled: computed(() => Boolean(workspaceId.value)),
})

const columns: Array<{ status: TaskStatus; label: string }> = [
  { status: 'backlog', label: 'Backlog' },
  { status: 'ready', label: 'Ready' },
  { status: 'running', label: 'Running' },
  { status: 'review', label: 'Review' },
  { status: 'done', label: 'Done' },
  { status: 'failed', label: 'Failed' },
]
const boards = computed(() => boardsQ.data.value?.boards ?? [])
const agents = computed(() => agentsQ.data.value?.agents ?? [])
const channels = computed(() => (channelsQ.data.value?.channels ?? []).filter(channel => channel.type === 'text' && channel.visibility === 'workspace'))
const selectedBoardId = ref<string | null>(null)
const activeBoard = computed(() => boards.value.find(board => board.id === selectedBoardId.value) ?? boards.value[0] ?? null)
watch(boards, (value) => {
  if (!selectedBoardId.value || !value.some(board => board.id === selectedBoardId.value)) selectedBoardId.value = value[0]?.id ?? null
}, { immediate: true })

const showAgent = ref(false)
const showBoard = ref(false)
const showTask = ref(false)
const creating = ref(false)
const runningId = ref<string | null>(null)
const agentForm = reactive({ displayName: '', model: '@cf/moonshotai/kimi-k2.7-code', instructions: '' })
const boardName = ref('')
const taskForm = reactive<{ title: string; description: string; assigneeId: string | null; channelId: string | null }>({
  title: '', description: '', assigneeId: null, channelId: null,
})

const agentOptions = computed(() => [
  { label: 'Unassigned', value: null },
  ...agents.value.filter(agent => agent.status === 'active').map(agent => ({ label: agent.displayName, value: agent.id })),
])
const channelOptions = computed(() => [
  { label: 'No report channel', value: null },
  ...channels.value.map(channel => ({ label: `# ${channel.name}`, value: channel.id })),
])

function tasksFor(status: TaskStatus) {
  return activeBoard.value?.tasks.filter(task => task.status === status) ?? []
}

function agentName(id: string | null) {
  return agents.value.find(agent => agent.id === id)?.displayName ?? 'Unassigned'
}

async function refresh() {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ['agents', workspaceId.value] }),
    qc.invalidateQueries({ queryKey: ['boards', workspaceId.value] }),
    qc.invalidateQueries({ queryKey: ['members', workspaceId.value] }),
  ])
}

async function createAgent() {
  if (!agentForm.displayName.trim()) return
  creating.value = true
  try {
    await $fetch(`/api/workspaces/${workspaceId.value}/agents`, { method: 'POST', body: agentForm })
    Object.assign(agentForm, { displayName: '', model: '@cf/moonshotai/kimi-k2.7-code', instructions: '' })
    showAgent.value = false
    await refresh()
  }
  catch (error) {
    toast.add({ title: errorMessage(error), color: 'error' })
  }
  finally {
    creating.value = false
  }
}

async function createBoard() {
  if (!boardName.value.trim()) return
  creating.value = true
  try {
    const result = await $fetch<{ board: TaskBoardDTO }>(`/api/workspaces/${workspaceId.value}/boards`, { method: 'POST', body: { name: boardName.value } })
    boardName.value = ''
    showBoard.value = false
    selectedBoardId.value = result.board.id
    await refresh()
  }
  catch (error) {
    toast.add({ title: errorMessage(error), color: 'error' })
  }
  finally {
    creating.value = false
  }
}

async function createTask() {
  if (!activeBoard.value || !taskForm.title.trim()) return
  creating.value = true
  try {
    await $fetch(`/api/boards/${activeBoard.value.id}/tasks`, { method: 'POST', body: taskForm })
    Object.assign(taskForm, { title: '', description: '', assigneeId: null, channelId: null })
    showTask.value = false
    await refresh()
  }
  catch (error) {
    toast.add({ title: errorMessage(error), color: 'error' })
  }
  finally {
    creating.value = false
  }
}

async function runTask(task: TaskDTO) {
  runningId.value = task.id
  try {
    await $fetch(`/api/tasks/${task.id}/run`, { method: 'POST' })
    await refresh()
  }
  catch (error) {
    toast.add({ title: errorMessage(error), color: 'error' })
  }
  finally {
    runningId.value = null
  }
}

async function setStatus(task: TaskDTO, status: TaskStatus) {
  if (status === 'running') return
  await $fetch(`/api/tasks/${task.id}`, { method: 'PATCH', body: { status } })
  await refresh()
}
</script>

<template>
  <LayoutAppShell :workspace-id="workspaceId || undefined">
    <main class="flex-1 min-w-0 min-h-0 flex flex-col">
      <header class="h-12 px-4 flex items-center gap-2 shrink-0 shadow-[0_1px_0_var(--ui-border)]">
        <UIcon name="i-ph-kanban" class="size-5" />
        <span class="font-semibold">Tasks</span>
        <div class="ml-auto flex items-center gap-2">
          <UButton color="neutral" variant="ghost" icon="i-ph-robot" label="Agents" @click="showAgent = true" />
          <UButton color="neutral" variant="ghost" icon="i-ph-plus" label="Board" @click="showBoard = true" />
          <UButton icon="i-ph-plus" label="Task" :disabled="!activeBoard" @click="showTask = true" />
        </div>
      </header>

      <div v-if="boardsQ.isPending.value" class="p-6"><USkeleton class="h-64" /></div>
      <UAlert v-else-if="boardsQ.error.value" color="error" title="Could not load task boards." class="m-6" />
      <div v-else class="flex-1 min-h-0 overflow-auto p-4">
        <div v-if="agents.length" class="flex gap-2 mb-4 overflow-x-auto">
          <div v-for="agent in agents" :key="agent.id" class="df-panel rounded-lg px-3 py-2 flex items-center gap-2 shrink-0">
            <UAvatar size="xs" icon="i-ph-robot" />
            <div class="leading-tight">
              <div class="text-sm font-medium">{{ agent.displayName }}</div>
              <div class="text-[11px] text-muted">{{ agent.status }} · {{ agent.model }}</div>
            </div>
          </div>
        </div>

        <div v-if="boards.length" class="flex items-center gap-2 mb-4">
          <UButton
            v-for="board in boards"
            :key="board.id"
            size="sm"
            color="neutral"
            :variant="activeBoard?.id === board.id ? 'soft' : 'ghost'"
            :label="board.name"
            @click="selectedBoardId = board.id"
          />
        </div>

        <div v-if="!activeBoard" class="h-full flex items-center justify-center">
          <UButton icon="i-ph-plus" label="Create first board" @click="showBoard = true" />
        </div>
        <div v-else class="grid grid-flow-col auto-cols-[minmax(260px,1fr)] gap-3 min-w-max h-full items-start">
          <section v-for="column in columns" :key="column.status" class="w-[280px] rounded-xl bg-muted p-2">
            <div class="h-8 px-1 flex items-center gap-2 text-xs font-semibold text-muted">
              <span>{{ column.label }}</span><span>{{ tasksFor(column.status).length }}</span>
            </div>
            <div class="space-y-2">
              <article v-for="task in tasksFor(column.status)" :key="task.id" class="df-panel rounded-lg p-3 space-y-2">
                <div class="font-medium text-sm">{{ task.title }}</div>
                <p v-if="task.description" class="text-xs text-muted line-clamp-3">{{ task.description }}</p>
                <div class="flex items-center gap-1 text-[11px] text-muted">
                  <UIcon name="i-ph-robot" class="size-3.5" />
                  <span class="truncate">{{ agentName(task.assigneeId) }}</span>
                </div>
                <UAlert v-if="task.lastError" color="error" :description="task.lastError" />
                <div v-if="task.resultSummary" class="text-xs border-t border-default pt-2">
                  {{ task.resultSummary }}
                </div>
                <div class="flex items-center gap-1 pt-1">
                  <UButton
                    v-if="task.assigneeId && task.status !== 'running' && task.status !== 'done'"
                    size="xs"
                    icon="i-ph-play"
                    label="Run"
                    :loading="runningId === task.id"
                    @click="runTask(task)"
                  />
                  <USelect
                    v-if="task.status !== 'running'"
                    :model-value="task.status"
                    :items="columns.filter(item => item.status !== 'running').map(item => ({ label: item.label, value: item.status }))"
                    size="xs"
                    class="ml-auto w-24"
                    @update:model-value="value => setStatus(task, value as TaskStatus)"
                  />
                  <UIcon v-else name="i-ph-spinner-gap" class="ml-auto size-4 animate-spin text-primary" />
                </div>
              </article>
            </div>
          </section>
        </div>
      </div>
    </main>

    <UModal v-model:open="showAgent" title="Create agent">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name"><UInput v-model="agentForm.displayName" autofocus class="w-full" /></UFormField>
          <UFormField label="Workers AI model"><UInput v-model="agentForm.model" class="w-full" /></UFormField>
          <UFormField label="Profile instructions"><UTextarea v-model="agentForm.instructions" :rows="7" class="w-full" /></UFormField>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" label="Cancel" @click="showAgent = false" />
        <UButton label="Create agent" :loading="creating" :disabled="!agentForm.displayName.trim()" @click="createAgent" />
      </template>
    </UModal>

    <UModal v-model:open="showBoard" title="Create board">
      <template #body><UFormField label="Name"><UInput v-model="boardName" autofocus class="w-full" @keyup.enter="createBoard" /></UFormField></template>
      <template #footer>
        <UButton color="neutral" variant="ghost" label="Cancel" @click="showBoard = false" />
        <UButton label="Create board" :loading="creating" :disabled="!boardName.trim()" @click="createBoard" />
      </template>
    </UModal>

    <UModal v-model:open="showTask" title="Create task">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Title"><UInput v-model="taskForm.title" autofocus class="w-full" /></UFormField>
          <UFormField label="Description"><UTextarea v-model="taskForm.description" :rows="6" class="w-full" /></UFormField>
          <UFormField label="Agent"><USelect v-model="taskForm.assigneeId" :items="agentOptions" class="w-full" /></UFormField>
          <UFormField label="Report channel"><USelect v-model="taskForm.channelId" :items="channelOptions" class="w-full" /></UFormField>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" label="Cancel" @click="showTask = false" />
        <UButton label="Create task" :loading="creating" :disabled="!taskForm.title.trim()" @click="createTask" />
      </template>
    </UModal>
  </LayoutAppShell>
</template>
