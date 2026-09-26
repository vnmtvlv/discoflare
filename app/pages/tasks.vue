<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type {
  ChannelDTO,
  TaskAgentDTO,
  TaskBoardDTO,
  TaskDetailDTO,
  TaskLabelDTO,
  TaskDTO,
  TaskPriority,
  TaskStatus,
} from '~~/shared/types'
import { boardPath } from '~~/shared/paths'

definePageMeta({ layout: 'workspace', middleware: ['auth', 'manage-tasks'] })

const { workspaceId } = useWorkspace()
const isMobile = useIsMobile()
const { api } = useApi()
const qc = useQueryClient()
const toast = useToast()

/** Board and the archived view live in the URL so the sidebar can link to them. */
const route = useRoute()
const nav = useNavActions()
const showArchived = computed({
  get: () => route.query.archived === '1',
  set: value => void navigateTo(boardPath(null, value)),
})
const selectedBoardId = computed({
  get: () => String(route.query.board || '') || null,
  set: value => void navigateTo(boardPath(value, showArchived.value)),
})
const selectedTaskId = computed({
  get: () => String(route.query.task || '') || null,
  set: value => void navigateTo({ query: { ...route.query, task: value || undefined } }),
})
const taskSearch = ref('')
const showBoardForm = ref(false)
const showTaskForm = ref(false)
const showLabels = ref(false)
const showConfirm = ref(false)
const saving = ref(false)
const draggedTaskId = ref<string | null>(null)
const confirmAction = shallowRef<null | (() => Promise<void>)>(null)
const confirmTitle = ref('')

const agentsQ = useQuery({
  queryKey: computed(() => ['agents', workspaceId.value]),
  queryFn: () => api<{ agents: TaskAgentDTO[] }>(`/api/workspaces/${workspaceId.value}/task-agents`),
  enabled: computed(() => Boolean(workspaceId.value)),
})
const boardsQ = useQuery({
  queryKey: computed(() => ['boards', workspaceId.value, showArchived.value]),
  queryFn: () => api<{ boards: TaskBoardDTO[] }>(`/api/workspaces/${workspaceId.value}/boards`, { query: { archived: showArchived.value } }),
  enabled: computed(() => Boolean(workspaceId.value)),
})
const channelsQ = useQuery({
  queryKey: computed(() => ['channels', workspaceId.value]),
  queryFn: () => api<{ channels: ChannelDTO[] }>(`/api/workspaces/${workspaceId.value}/channels`),
  enabled: computed(() => Boolean(workspaceId.value)),
})
const taskQ = useQuery({
  queryKey: computed(() => ['task', selectedTaskId.value]),
  queryFn: () => api<{ task: TaskDetailDTO }>(`/api/tasks/${selectedTaskId.value}`),
  enabled: computed(() => Boolean(selectedTaskId.value)),
})

const allBoards = computed(() => boardsQ.data.value?.boards ?? [])
const boards = computed(() => showArchived.value
  ? allBoards.value.filter(board => Boolean(board.archivedAt) || board.tasks.some(task => Boolean(task.archivedAt)))
  : allBoards.value)
const activeBoard = computed(() => boards.value.find(board => board.id === selectedBoardId.value) ?? boards.value[0] ?? null)
const boardTasks = computed(() => {
  const board = activeBoard.value
  if (!board) return []
  if (!showArchived.value) return board.tasks
  return board.archivedAt ? board.tasks : board.tasks.filter(task => Boolean(task.archivedAt))
})
const activeTasks = computed(() => {
  const query = taskSearch.value.trim().toLocaleLowerCase().replace(/^#/u, '')
  if (!query) return boardTasks.value
  return boardTasks.value.filter(task => [String(task.number), task.title, task.description]
    .some(value => value.toLocaleLowerCase().includes(query)))
})
const agents = computed(() => agentsQ.data.value?.agents ?? [])
const channels = computed(() => (channelsQ.data.value?.channels ?? []).filter(channel => channel.type === 'text' && channel.visibility === 'workspace'))
const selectedTask = computed(() => taskQ.data.value?.task ?? null)

/** A board id that no longer resolves (deleted, archived away) falls back to the first one. */
watch([boards, selectedBoardId], ([value, id]) => {
  if (!id || !value.length) return
  if (!value.some(board => board.id === id)) selectedBoardId.value = value[0]?.id ?? null
}, { immediate: true })

watch(showArchived, () => {
  selectedTaskId.value = null
})

watch(() => nav.createBoardOpen.value, (open) => {
  if (!open) return
  nav.createBoardOpen.value = false
  openCreateBoard()
})

const columns: Array<{ status: TaskStatus; label: string }> = [
  { status: 'backlog', label: 'Backlog' },
  { status: 'ready', label: 'Ready' },
  { status: 'review', label: 'Review' },
  { status: 'done', label: 'Done' },
  { status: 'failed', label: 'Failed' },
]
const manualStatusOptions = columns.map(column => ({ label: column.label, value: column.status }))
const priorityOptions: Array<{ label: string; value: TaskPriority }> = [
  { label: 'Low', value: 'low' },
  { label: 'Normal', value: 'normal' },
  { label: 'High', value: 'high' },
  { label: 'Urgent', value: 'urgent' },
]
const labelColors = ['neutral', 'primary', 'info', 'success', 'warning', 'error'] as const
const labelColorOptions = [...labelColors]
const agentOptions = computed(() => [
  { label: 'Unassigned', value: null },
  ...agents.value.filter(agent => agent.status === 'active').map(agent => ({ label: agent.displayName, value: agent.id })),
])
const channelOptions = computed(() => [
  { label: 'No report channel', value: null },
  ...channels.value.map(channel => ({ label: `# ${channel.name}`, value: channel.id })),
])
const boardOptions = computed(() => allBoards.value.filter(board => !board.archivedAt).map(board => ({ label: board.name, value: board.id })))

type TaskForm = {
  title: string
  description: string
  priority: TaskPriority
  dueAt: string
  assigneeId: string | null
  channelId: string | null
  labelIds: string[]
  dependencyIds: string[]
}

const newTask = reactive<TaskForm>({ title: '', description: '', priority: 'normal', dueAt: '', assigneeId: null, channelId: null, labelIds: [], dependencyIds: [] })
const editTask = reactive<TaskForm & { boardId: string; status: TaskStatus }>({
  title: '', description: '', priority: 'normal', dueAt: '', assigneeId: null, channelId: null, labelIds: [], dependencyIds: [], boardId: '', status: 'backlog',
})
const boardName = ref('')
const editingBoardId = ref<string | null>(null)
const labelName = ref('')
const labelColor = ref<(typeof labelColors)[number]>('neutral')
const editingLabelId = ref<string | null>(null)
const checklistTitle = ref('')
const uploadFile = shallowRef<File | null>(null)

watch(selectedTask, (task) => {
  if (!task) return
  Object.assign(editTask, {
    title: task.title,
    description: task.description,
    priority: task.priority,
    dueAt: toDateInput(task.dueAt),
    assigneeId: task.assigneeId,
    channelId: task.channelId,
    labelIds: task.labels.map(label => label.id),
    dependencyIds: [...task.dependencyIds],
    boardId: task.boardId,
    status: task.status,
  })
}, { immediate: true })

function tasksFor(status: TaskStatus) {
  return activeTasks.value.filter(task => task.status === status)
}

function taskLabel(task: Pick<TaskDTO, 'number' | 'title'>) {
  return `#${task.number} ${task.title}`
}

function agentName(id: string | null) {
  return agents.value.find(agent => agent.id === id)?.displayName ?? 'Unassigned'
}

function priorityColor(priority: TaskPriority) {
  return priority === 'urgent' ? 'error' : priority === 'high' ? 'warning' : priority === 'low' ? 'neutral' : 'primary'
}

function toDateInput(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function toIso(value: string) {
  return value ? new Date(value).toISOString() : null
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : ''
}

function toggleId(list: string[], id: string, selected: boolean) {
  const index = list.indexOf(id)
  if (selected && index === -1) list.push(id)
  if (!selected && index !== -1) list.splice(index, 1)
}

async function refresh(taskId: string | null = selectedTaskId.value) {
  await qc.invalidateQueries({ queryKey: ['boards'] })
  if (taskId) await qc.invalidateQueries({ queryKey: ['task', taskId] })
}

async function mutate(action: () => Promise<unknown>, success?: string) {
  saving.value = true
  try {
    await action()
    if (success) toast.add({ title: success, color: 'success' })
    await refresh()
    return true
  }
  catch (error) {
    toast.add({ title: errorMessage(error), color: 'error' })
    return false
  }
  finally {
    saving.value = false
  }
}

function openCreateBoard() {
  editingBoardId.value = null
  boardName.value = ''
  showBoardForm.value = true
}

function openRenameBoard() {
  if (!activeBoard.value) return
  editingBoardId.value = activeBoard.value.id
  boardName.value = activeBoard.value.name
  showBoardForm.value = true
}

async function saveBoard() {
  if (!boardName.value.trim()) return
  const editing = editingBoardId.value
  const action = editing
    ? async () => { await api(`/api/boards/${editing}`, { method: 'PATCH', body: { name: boardName.value } }) }
    : async () => { await api(`/api/workspaces/${workspaceId.value}/boards`, { method: 'POST', body: { name: boardName.value } }) }
  const ok = await mutate(action, editing ? 'Board renamed' : 'Board created')
  if (ok) showBoardForm.value = false
}

async function moveBoard(direction: -1 | 1) {
  const board = activeBoard.value
  if (!board || showArchived.value) return
  const ids = boards.value.map(item => item.id)
  const index = ids.indexOf(board.id)
  const target = index + direction
  if (target < 0 || target >= ids.length) return
  ;[ids[index], ids[target]] = [ids[target]!, ids[index]!]
  await mutate(() => api(`/api/workspaces/${workspaceId.value}/boards/reorder`, { method: 'PATCH', body: { boardIds: ids } }))
}

function askConfirm(title: string, action: () => Promise<void>) {
  confirmTitle.value = title
  confirmAction.value = action
  showConfirm.value = true
}

async function confirmMutation() {
  const action = confirmAction.value
  showConfirm.value = false
  if (action) await action()
  confirmAction.value = null
}

function archiveBoard() {
  const board = activeBoard.value
  if (!board) return
  askConfirm(board.archivedAt ? 'Restore board?' : 'Archive board?', async () => {
    await mutate(() => api(`/api/boards/${board.id}`, { method: 'PATCH', body: { archived: !board.archivedAt } }), board.archivedAt ? 'Board restored' : 'Board archived')
  })
}

function deleteBoard() {
  const board = activeBoard.value
  if (!board) return
  askConfirm(`Delete ${board.name} and every task?`, async () => {
    const ok = await mutate(() => api(`/api/boards/${board.id}`, { method: 'DELETE' }), 'Board deleted')
    if (ok) selectedBoardId.value = boards.value.find(board => board.id !== activeBoard.value?.id)?.id ?? null
  })
}

function openCreateTask() {
  Object.assign(newTask, { title: '', description: '', priority: 'normal', dueAt: '', assigneeId: null, channelId: null, labelIds: [], dependencyIds: [] })
  showTaskForm.value = true
}

async function createTask() {
  if (!activeBoard.value || !newTask.title.trim()) return
  const ok = await mutate(() => api(`/api/boards/${activeBoard.value!.id}/tasks`, {
    method: 'POST',
    body: { ...newTask, dueAt: toIso(newTask.dueAt) },
  }), 'Task created')
  if (ok) showTaskForm.value = false
}

function openTask(task: TaskDTO) {
  selectedTaskId.value = String(task.number)
}

async function saveTask() {
  const task = selectedTask.value
  if (!task) return
  await mutate(() => api(`/api/tasks/${task.id}`, {
    method: 'PATCH',
    body: { ...editTask, dueAt: toIso(editTask.dueAt) },
  }), 'Task saved')
}

function changeEditBoard(value: string | number | undefined) {
  if (value === undefined || String(value) === editTask.boardId) return
  editTask.boardId = String(value)
  editTask.labelIds.splice(0)
  editTask.dependencyIds.splice(0)
}

async function setStatus(taskId: string, status: TaskStatus, position?: number) {
  await mutate(() => api(`/api/tasks/${taskId}`, { method: 'PATCH', body: { status, ...(position === undefined ? {} : { position }) } }))
}

async function dropTask(status: TaskStatus, beforeTaskId: string | null = null) {
  const taskId = draggedTaskId.value
  draggedTaskId.value = null
  if (!taskId || showArchived.value) return
  await mutate(() => api(`/api/boards/${activeBoard.value!.id}/tasks/reorder`, {
    method: 'PATCH',
    body: { taskId, status, beforeTaskId: beforeTaskId === taskId ? null : beforeTaskId },
  }))
}

function archiveTask() {
  const task = selectedTask.value
  if (!task) return
  askConfirm(task.archivedAt ? 'Restore task?' : 'Archive task?', async () => {
    const ok = await mutate(() => api(`/api/tasks/${task.id}`, { method: 'PATCH', body: { archived: !task.archivedAt } }), task.archivedAt ? 'Task restored' : 'Task archived')
    if (ok) selectedTaskId.value = null
  })
}

function deleteTask() {
  const task = selectedTask.value
  if (!task) return
  askConfirm(`Delete ${task.title}?`, async () => {
    const ok = await mutate(() => api(`/api/tasks/${task.id}`, { method: 'DELETE' }), 'Task deleted')
    if (ok) selectedTaskId.value = null
  })
}

function openLabels() {
  editingLabelId.value = null
  labelName.value = ''
  labelColor.value = 'neutral'
  showLabels.value = true
}

function editLabel(label: TaskLabelDTO) {
  editingLabelId.value = label.id
  labelName.value = label.name
  labelColor.value = label.color as (typeof labelColors)[number]
}

async function saveLabel() {
  if (!activeBoard.value || !labelName.value.trim()) return
  const id = editingLabelId.value
  const ok = await mutate(() => id
    ? api(`/api/task-labels/${id}`, { method: 'PATCH', body: { name: labelName.value, color: labelColor.value } })
    : api(`/api/boards/${activeBoard.value!.id}/labels`, { method: 'POST', body: { name: labelName.value, color: labelColor.value } }), id ? 'Label saved' : 'Label created')
  if (ok) {
    editingLabelId.value = null
    labelName.value = ''
    labelColor.value = 'neutral'
  }
}

async function deleteLabel(id: string) {
  await mutate(() => api(`/api/task-labels/${id}`, { method: 'DELETE' }), 'Label deleted')
}

async function addChecklistItem() {
  const task = selectedTask.value
  if (!task || !checklistTitle.value.trim()) return
  const title = checklistTitle.value
  checklistTitle.value = ''
  await mutate(() => api(`/api/tasks/${task.id}/checklist`, { method: 'POST', body: { title } }))
}

async function updateChecklistItem(id: string, completed: boolean) {
  await mutate(() => api(`/api/task-checklist/${id}`, { method: 'PATCH', body: { completed } }))
}

async function deleteChecklistItem(id: string) {
  await mutate(() => api(`/api/task-checklist/${id}`, { method: 'DELETE' }))
}

async function uploadAttachment() {
  const task = selectedTask.value
  const file = uploadFile.value
  if (!task || !file) return
  const form = new FormData()
  form.append('file', file)
  const ok = await mutate(() => api(`/api/tasks/${task.id}/attachments`, { method: 'POST', body: form }), 'File attached')
  if (ok) uploadFile.value = null
}

async function deleteAttachment(id: string) {
  await mutate(() => api(`/api/task-attachments/${id}`, { method: 'DELETE' }), 'Attachment deleted')
}

const boardMenu = computed(() => [[
  { label: 'Rename', icon: 'i-ph-pencil-simple', onSelect: openRenameBoard },
  { label: 'Labels', icon: 'i-ph-tag', onSelect: openLabels },
  { label: 'Move left', icon: 'i-ph-arrow-left', disabled: showArchived.value || boards.value[0]?.id === activeBoard.value?.id, onSelect: () => moveBoard(-1) },
  { label: 'Move right', icon: 'i-ph-arrow-right', disabled: showArchived.value || boards.value.at(-1)?.id === activeBoard.value?.id, onSelect: () => moveBoard(1) },
], [
  { label: activeBoard.value?.archivedAt ? 'Restore' : 'Archive', icon: 'i-ph-archive', onSelect: archiveBoard },
  { label: 'Delete', icon: 'i-ph-trash', color: 'error' as const, onSelect: deleteBoard },
]])
</script>

<template>
  <div class="flex h-full min-h-0 min-w-0 flex-col">
    <main class="flex-1 min-w-0 min-h-0 flex flex-col">
      <LayoutPageHeader icon="i-ph-kanban" :title="activeBoard?.name || 'Tasks'" :loading="boardsQ.isPending.value">
        <template #meta>
          <UBadge v-if="showArchived" label="Archived" color="neutral" variant="subtle" size="sm" />
        </template>
        <template #actions>
          <UInput v-model="taskSearch" icon="i-ph-magnifying-glass" placeholder="Search tasks" aria-label="Search tasks" class="w-28 sm:w-44" />
          <UDropdownMenu v-if="activeBoard" :items="boardMenu">
            <UButton color="neutral" variant="ghost" icon="i-ph-dots-three" aria-label="Board actions" />
          </UDropdownMenu>
          <UButton v-if="!showArchived" icon="i-ph-plus" :label="isMobile ? undefined : 'Task'" aria-label="New task" :disabled="!activeBoard" @click="openCreateTask" />
        </template>
      </LayoutPageHeader>

      <LayoutSkeleton v-if="boardsQ.isPending.value" variant="board" />
      <LayoutLoadError v-else-if="boardsQ.error.value" message="Task boards did not load." :retry="boardsQ.refetch" />
      <div v-else class="flex-1 min-h-0 overflow-auto p-4">
        <div v-if="!activeBoard" class="h-full flex items-center justify-center">
          <UButton v-if="!showArchived" icon="i-ph-plus" label="Create first board" @click="openCreateBoard" />
          <span v-else class="text-sm text-muted">Nothing archived</span>
        </div>
        <div v-else class="grid grid-flow-col auto-cols-[minmax(260px,1fr)] gap-3 min-w-max h-full items-start">
          <section
            v-for="column in columns"
            :key="column.status"
            class="w-[280px] rounded-xl bg-muted p-2"
            @dragover.prevent
            @drop="dropTask(column.status)"
          >
            <div class="h-8 px-1 flex items-center gap-2 text-xs font-semibold text-muted">
              <span>{{ column.label }}</span><span>{{ tasksFor(column.status).length }}</span>
            </div>
            <div class="space-y-2 min-h-10">
              <article
                v-for="task in tasksFor(column.status)"
                :key="task.id"
                class="df-panel rounded-lg p-3 space-y-2 cursor-pointer"
                :draggable="!showArchived"
                @dragstart="draggedTaskId = task.id"
                @dragend="draggedTaskId = null"
                @dragover.prevent
                @drop.stop="dropTask(column.status, task.id)"
                @click="openTask(task)"
              >
                <div class="flex items-start gap-2">
                  <div class="font-medium text-sm flex-1 min-w-0">
                    <span class="mr-1 text-muted">#{{ task.number }}</span>{{ task.title }}
                  </div>
                  <UBadge v-if="task.priority !== 'normal'" :color="priorityColor(task.priority)" variant="subtle" size="xs">{{ task.priority }}</UBadge>
                </div>
                <p v-if="task.description" class="text-xs text-muted line-clamp-3">{{ task.description }}</p>
                <div v-if="task.labels.length" class="flex flex-wrap gap-1">
                  <UBadge v-for="label in task.labels" :key="label.id" :color="label.color as 'neutral'" variant="subtle" size="xs">{{ label.name }}</UBadge>
                </div>
                <div class="flex items-center gap-2 text-[11px] text-muted">
                  <span class="flex min-w-0 items-center gap-1"><UIcon name="i-ph-robot" class="size-3.5" /><span class="truncate">{{ agentName(task.assigneeId) }}</span></span>
                  <span v-if="task.checklistTotal" class="ml-auto">{{ task.checklistCompleted }}/{{ task.checklistTotal }}</span>
                  <UIcon v-if="task.attachmentCount" name="i-ph-paperclip" class="size-3.5" />
                </div>
                <div v-if="task.dueAt" class="text-[11px] text-muted">{{ formatDate(task.dueAt) }}</div>
                <UAlert v-if="task.lastError" color="error" :description="task.lastError" />
                <div v-if="task.resultSummary" class="text-xs border-t border-default pt-2 line-clamp-3">{{ task.resultSummary }}</div>
                <div v-if="!showArchived" class="flex items-center gap-1 pt-1" @click.stop>
                  <USelect
                    :model-value="task.status"
                    :items="manualStatusOptions"
                    size="xs"
                    class="ml-auto w-24"
                    @update:model-value="value => setStatus(task.id, value as TaskStatus)"
                  />
                </div>
              </article>
            </div>
          </section>
        </div>
      </div>
    </main>

    <UModal v-model:open="showBoardForm" :title="editingBoardId ? 'Rename board' : 'Create board'">
      <template #body>
        <UFormField label="Name"><UInput v-model="boardName" autofocus class="w-full" @keyup.enter="saveBoard" /></UFormField>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" label="Cancel" @click="showBoardForm = false" />
        <UButton label="Save" :loading="saving" :disabled="!boardName.trim()" @click="saveBoard" />
      </template>
    </UModal>

    <UModal v-model:open="showTaskForm" title="Create task" :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Title" class="sm:col-span-2"><UInput v-model="newTask.title" autofocus class="w-full" /></UFormField>
          <UFormField label="Description" class="sm:col-span-2"><UTextarea v-model="newTask.description" :rows="5" class="w-full" /></UFormField>
          <UFormField label="Agent"><USelect v-model="newTask.assigneeId" :items="agentOptions" class="w-full" /></UFormField>
          <UFormField label="Report channel"><USelect v-model="newTask.channelId" :items="channelOptions" class="w-full" /></UFormField>
          <UFormField label="Priority"><USelect v-model="newTask.priority" :items="priorityOptions" class="w-full" /></UFormField>
          <UFormField label="Due"><UInput v-model="newTask.dueAt" type="datetime-local" class="w-full" /></UFormField>
          <div v-if="activeBoard?.labels.length" class="sm:col-span-2">
            <div class="text-sm font-medium mb-2">Labels</div>
            <div class="flex flex-wrap gap-3">
              <UCheckbox v-for="label in activeBoard.labels" :key="label.id" :model-value="newTask.labelIds.includes(label.id)" :label="label.name" @update:model-value="value => toggleId(newTask.labelIds, label.id, Boolean(value))" />
            </div>
          </div>
          <div v-if="boardTasks.length" class="sm:col-span-2">
            <div class="text-sm font-medium mb-2">Dependencies</div>
            <div class="max-h-32 overflow-y-auto space-y-1">
              <UCheckbox v-for="task in boardTasks" :key="task.id" :model-value="newTask.dependencyIds.includes(task.id)" :label="taskLabel(task)" @update:model-value="value => toggleId(newTask.dependencyIds, task.id, Boolean(value))" />
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" label="Cancel" @click="showTaskForm = false" />
        <UButton label="Create task" :loading="saving" :disabled="!newTask.title.trim()" @click="createTask" />
      </template>
    </UModal>

    <UModal v-model:open="showLabels" title="Labels">
      <template #body>
        <div class="space-y-4">
          <div class="flex gap-2">
            <UInput v-model="labelName" placeholder="Label" class="flex-1" @keyup.enter="saveLabel" />
            <USelect v-model="labelColor" :items="labelColorOptions" class="w-32" />
            <UButton :label="editingLabelId ? 'Save' : 'Add'" :loading="saving" :disabled="!labelName.trim()" @click="saveLabel" />
          </div>
          <div class="divide-y divide-default">
            <div v-for="label in activeBoard?.labels ?? []" :key="label.id" class="py-2 flex items-center gap-2">
              <UBadge :color="label.color as 'neutral'" variant="subtle">{{ label.name }}</UBadge>
              <UButton class="ml-auto" color="neutral" variant="ghost" icon="i-ph-pencil-simple" aria-label="Edit label" @click="editLabel(label)" />
              <UButton color="error" variant="ghost" icon="i-ph-trash" aria-label="Delete label" @click="deleteLabel(label.id)" />
            </div>
          </div>
        </div>
      </template>
    </UModal>

    <USlideover :open="Boolean(selectedTaskId)" :title="selectedTask ? taskLabel(selectedTask) : 'Task'" :ui="{ content: 'w-full max-w-2xl' }" @update:open="value => { if (!value) selectedTaskId = null }">
      <template #body>
        <LayoutSkeleton v-if="taskQ.isPending.value" variant="form" />
        <LayoutLoadError v-else-if="taskQ.error.value" message="This task did not load." :retry="taskQ.refetch" />
        <div v-else-if="selectedTask" class="space-y-6">
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Title" class="sm:col-span-2"><UInput v-model="editTask.title" class="w-full" /></UFormField>
            <UFormField label="Description" class="sm:col-span-2"><UTextarea v-model="editTask.description" :rows="6" class="w-full" /></UFormField>
            <UFormField label="Board"><USelect :model-value="editTask.boardId" :items="boardOptions" class="w-full" @update:model-value="changeEditBoard" /></UFormField>
            <UFormField label="Status"><USelect v-model="editTask.status" :items="manualStatusOptions" class="w-full" /></UFormField>
            <UFormField label="Agent"><USelect v-model="editTask.assigneeId" :items="agentOptions" class="w-full" /></UFormField>
            <UFormField label="Report channel"><USelect v-model="editTask.channelId" :items="channelOptions" class="w-full" /></UFormField>
            <UFormField label="Priority"><USelect v-model="editTask.priority" :items="priorityOptions" class="w-full" /></UFormField>
            <UFormField label="Due"><UInput v-model="editTask.dueAt" type="datetime-local" class="w-full" /></UFormField>
          </div>

          <div v-if="allBoards.find(board => board.id === editTask.boardId)?.labels.length">
            <div class="text-sm font-medium mb-2">Labels</div>
            <div class="flex flex-wrap gap-3">
              <UCheckbox
                v-for="label in allBoards.find(board => board.id === editTask.boardId)?.labels ?? []"
                :key="label.id"
                :model-value="editTask.labelIds.includes(label.id)"
                :label="label.name"
                @update:model-value="value => toggleId(editTask.labelIds, label.id, Boolean(value))"
              />
            </div>
          </div>

          <div>
            <div class="text-sm font-medium mb-2">Dependencies</div>
            <div class="max-h-36 overflow-y-auto space-y-1">
              <UCheckbox
                v-for="task in allBoards.find(board => board.id === editTask.boardId)?.tasks.filter(task => task.id !== selectedTask?.id && !task.archivedAt) ?? []"
                :key="task.id"
                :model-value="editTask.dependencyIds.includes(task.id)"
                :label="taskLabel(task)"
                @update:model-value="value => toggleId(editTask.dependencyIds, task.id, Boolean(value))"
              />
            </div>
          </div>

          <div class="flex gap-2">
            <UButton v-if="!selectedTask.archivedAt" label="Save" :loading="saving" @click="saveTask" />
            <UButton class="ml-auto" color="neutral" variant="ghost" :label="selectedTask.archivedAt ? 'Restore' : 'Archive'" @click="archiveTask" />
            <UButton color="error" variant="ghost" label="Delete" @click="deleteTask" />
          </div>

          <div>
            <div class="text-sm font-medium mb-2">Checklist</div>
            <div class="space-y-2">
              <div v-for="item in selectedTask.checklist" :key="item.id" class="flex items-center gap-2">
                <UCheckbox :model-value="item.completed" :label="item.title" @update:model-value="value => updateChecklistItem(item.id, Boolean(value))" />
                <UButton class="ml-auto" color="error" variant="ghost" size="xs" icon="i-ph-x" aria-label="Delete checklist item" @click="deleteChecklistItem(item.id)" />
              </div>
              <div class="flex gap-2">
                <UInput v-model="checklistTitle" placeholder="Add item" class="flex-1" @keyup.enter="addChecklistItem" />
                <UButton icon="i-ph-plus" aria-label="Add checklist item" :disabled="!checklistTitle.trim()" @click="addChecklistItem" />
              </div>
            </div>
          </div>

          <div>
            <div class="text-sm font-medium mb-2">Attachments</div>
            <div class="space-y-2">
              <div v-for="attachment in selectedTask.attachments" :key="attachment.id" class="flex items-center gap-2 text-sm">
                <UIcon name="i-ph-paperclip" class="size-4" />
                <ULink :to="attachment.url" target="_blank" class="truncate">{{ attachment.filename }}</ULink>
                <UButton class="ml-auto" color="error" variant="ghost" size="xs" icon="i-ph-trash" aria-label="Delete attachment" @click="deleteAttachment(attachment.id)" />
              </div>
              <div class="flex items-center gap-2">
                <UFileUpload v-model="uploadFile" variant="button" label="Choose file" />
                <UButton v-if="uploadFile" label="Upload" :loading="saving" @click="uploadAttachment" />
              </div>
            </div>
          </div>

          <div v-if="selectedTask.resultSummary || selectedTask.resultDetails">
            <div class="text-sm font-medium mb-2">Result</div>
            <div class="rounded-lg border border-default p-3 space-y-2 text-sm">
              <div v-if="selectedTask.resultSummary">{{ selectedTask.resultSummary }}</div>
              <pre v-if="selectedTask.resultDetails" class="whitespace-pre-wrap text-xs text-muted font-sans">{{ selectedTask.resultDetails }}</pre>
            </div>
          </div>

        </div>
      </template>
    </USlideover>

    <UModal v-model:open="showConfirm" :title="confirmTitle">
      <template #footer>
        <UButton color="neutral" variant="ghost" label="Cancel" @click="showConfirm = false" />
        <UButton color="error" label="Confirm" :loading="saving" @click="confirmMutation" />
      </template>
    </UModal>
  </div>
</template>
