<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { DatabaseFieldTypes, DatabaseSlotCounts, type DatabaseFieldType, type DatabaseValue } from '~~/shared/database'
import { databasePath } from '~~/shared/paths'
import type { DatabaseDTO, DatabaseFieldDTO, DatabaseItemDTO } from '~~/shared/types'

definePageMeta({ layout: 'workspace', middleware: ['auth', 'manage-databases'] })

const { workspaceId } = useWorkspace()
const { api } = useApi()
const route = useRoute()
const nav = useNavActions()
const qc = useQueryClient()
const toast = useToast()

const showArchived = computed({
  get: () => route.query.archived === '1',
  set: value => void navigateTo(databasePath(null, value)),
})
const selectedDatabaseId = computed({
  get: () => String(route.query.database || '') || null,
  set: value => void navigateTo(databasePath(value, showArchived.value)),
})
const databasesQ = useQuery({
  queryKey: computed(() => ['databases', workspaceId.value, showArchived.value]),
  queryFn: () => api<{ databases: DatabaseDTO[] }>(`/api/workspaces/${workspaceId.value}/databases`, { query: { archived: showArchived.value } }),
  enabled: computed(() => Boolean(workspaceId.value)),
  refetchInterval: 10_000,
})
const allDatabases = computed(() => databasesQ.data.value?.databases ?? [])
const databases = computed(() => showArchived.value ? allDatabases.value.filter(database => Boolean(database.archivedAt)) : allDatabases.value)
const activeDatabase = computed(() => databases.value.find(database => database.id === selectedDatabaseId.value) ?? databases.value[0] ?? null)

const search = ref('')
const sortKey = ref('title')
const sortDirection = ref<'asc' | 'desc'>('asc')
const saving = ref(false)
const rowEdits = useDatabaseEdits(
  async (id, patch) => {
    const result = await api<{ item: DatabaseItemDTO }>(`/api/database-items/${id}`, { method: 'PATCH', body: patch })
    return result.item
  },
  () => { void refresh() },
)
onBeforeRouteUpdate(() => rowEdits.flush())
onBeforeRouteLeave(() => rowEdits.flush())
function beforeUnload(event: BeforeUnloadEvent) {
  if (!rowEdits.isDirty()) return
  event.preventDefault()
  event.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))

async function retryItem(item: DatabaseItemDTO) {
  const result = await databasesQ.refetch()
  const latest = result.data?.databases.find(database => database.id === item.databaseId)?.items.find(candidate => candidate.id === item.id)
  if (result.error || !latest) {
    toast.add({ title: result.error ? errorMessage(result.error) : 'This record is no longer available.', color: 'error' })
    return
  }
  await rowEdits.retry(latest)
}

const showDatabaseForm = ref(false)
const databaseName = ref('')
const editingDatabaseId = ref<string | null>(null)
const showFieldForm = ref(false)
const fieldName = ref('')
const fieldType = ref<DatabaseFieldType>('text')
const fieldOptions = ref('')
const editingFieldId = ref<string | null>(null)
const showConfirm = ref(false)
const confirmTitle = ref('')
const confirmAction = shallowRef<null | (() => Promise<void>)>(null)

const fieldTypeOptions = DatabaseFieldTypes.map(type => ({
  label: type.charAt(0).toUpperCase() + type.slice(1),
  value: type,
}))
const sortOptions = computed(() => [
  { label: 'Title', value: 'title' },
  ...(activeDatabase.value?.fields ?? []).map(field => ({ label: field.name, value: field.id })),
])
const visibleItems = computed(() => {
  const database = activeDatabase.value
  if (!database) return []
  const needle = search.value.trim().toLocaleLowerCase()
  const records = database.items.map(rowEdits.display)
  const items = needle
    ? records.filter(item => [item.title, ...database.fields.map(field => displayValue(item.values[field.id]))]
        .some(value => value.toLocaleLowerCase().includes(needle)))
    : [...records]
  const field = database.fields.find(candidate => candidate.id === sortKey.value)
  return items.sort((left, right) => {
    const leftValue = field ? left.values[field.id] : left.title
    const rightValue = field ? right.values[field.id] : right.title
    const comparison = compareValues(leftValue, rightValue)
    return sortDirection.value === 'asc' ? comparison : -comparison
  })
})

watch([databases, selectedDatabaseId], ([list, id]) => {
  if (!id || !list.length || list.some(database => database.id === id)) return
  selectedDatabaseId.value = list[0]?.id ?? null
}, { immediate: true })

watch(activeDatabase, (database) => {
  if (sortKey.value !== 'title' && !database?.fields.some(field => field.id === sortKey.value)) sortKey.value = 'title'
})

watch(() => nav.createDatabaseOpen.value, (open) => {
  if (!open) return
  nav.createDatabaseOpen.value = false
  openCreateDatabase()
})

function displayValue(value: DatabaseValue | undefined): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function compareValues(left: DatabaseValue | undefined, right: DatabaseValue | undefined): number {
  if (left === null || left === undefined) return right === null || right === undefined ? 0 : 1
  if (right === null || right === undefined) return -1
  if (typeof left === 'number' && typeof right === 'number') return left - right
  if (typeof left === 'boolean' && typeof right === 'boolean') return Number(left) - Number(right)
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' })
}

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value
}

async function refresh() {
  await Promise.all([qc.invalidateQueries({ queryKey: ['databases'] }), qc.invalidateQueries({ queryKey: ['data-resources'] })])
}

async function mutate(action: () => Promise<unknown>, success?: string) {
  if (saving.value) return false
  saving.value = true
  try {
    await action()
    await refresh()
    if (success) toast.add({ title: success, color: 'success' })
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

function openCreateDatabase() {
  editingDatabaseId.value = null
  databaseName.value = ''
  showDatabaseForm.value = true
}

function openRenameDatabase() {
  const database = activeDatabase.value
  if (!database) return
  editingDatabaseId.value = database.id
  databaseName.value = database.name
  showDatabaseForm.value = true
}

async function saveDatabase() {
  const name = databaseName.value.trim()
  if (!name || !workspaceId.value) return
  const editing = editingDatabaseId.value
  let createdId: string | null = null
  const ok = await mutate(async () => {
    if (editing) await api(`/api/databases/${editing}`, { method: 'PATCH', body: { name } })
    else {
      const result = await api<{ database: DatabaseDTO }>(`/api/workspaces/${workspaceId.value}/databases`, { method: 'POST', body: { name } })
      createdId = result.database.id
    }
  }, editing ? 'Database renamed' : 'Database created')
  if (!ok) return
  showDatabaseForm.value = false
  if (createdId) await navigateTo(databasePath(createdId))
}

async function archiveDatabase() {
  const database = activeDatabase.value
  if (!database) return
  await mutate(() => api(`/api/databases/${database.id}`, { method: 'PATCH', body: { archived: !database.archivedAt } }), database.archivedAt ? 'Database restored' : 'Database archived')
}

function deleteDatabase() {
  const database = activeDatabase.value
  if (!database) return
  askConfirm(`Delete ${database.name}?`, async () => {
    await mutate(() => api(`/api/databases/${database.id}`, { method: 'DELETE' }), 'Database deleted')
  })
}

function openCreateField() {
  if (!activeDatabase.value) return
  editingFieldId.value = null
  fieldName.value = ''
  fieldType.value = 'text'
  fieldOptions.value = ''
  showFieldForm.value = true
}

function openEditField(field: DatabaseFieldDTO) {
  editingFieldId.value = field.id
  fieldName.value = field.name
  fieldType.value = field.type
  fieldOptions.value = field.options.join(', ')
  showFieldForm.value = true
}

async function saveField() {
  const database = activeDatabase.value
  const name = fieldName.value.trim()
  if (!database || !name) return
  const options = fieldOptions.value.split(',').map(option => option.trim()).filter(Boolean)
  const editing = editingFieldId.value
  const body = editing
    ? { name, ...(fieldType.value === 'select' ? { options } : {}) }
    : { name, type: fieldType.value, options }
  const ok = await mutate(
    () => editing
      ? api(`/api/database-fields/${editing}`, { method: 'PATCH', body })
      : api(`/api/databases/${database.id}/fields`, { method: 'POST', body }),
    editing ? 'Field updated' : 'Field created',
  )
  if (ok) showFieldForm.value = false
}

function deleteField(field: DatabaseFieldDTO) {
  askConfirm(`Delete ${field.name}?`, async () => {
    await mutate(() => api(`/api/database-fields/${field.id}`, { method: 'DELETE' }), 'Field deleted')
  })
}

async function moveField(field: DatabaseFieldDTO, direction: -1 | 1) {
  const fields = activeDatabase.value?.fields ?? []
  const index = fields.findIndex(candidate => candidate.id === field.id)
  const other = fields[index + direction]
  if (!other) return
  await mutate(() => Promise.all([
    api(`/api/database-fields/${field.id}`, { method: 'PATCH', body: { position: other.position } }),
    api(`/api/database-fields/${other.id}`, { method: 'PATCH', body: { position: field.position } }),
  ]))
}

async function addItem() {
  const database = activeDatabase.value
  if (!database) return
  await mutate(() => api(`/api/databases/${database.id}/items`, { method: 'POST', body: { title: 'Untitled' } }))
}

async function updateTitle(item: DatabaseItemDTO, event: Event) {
  const title = inputValue(event).trim()
  if (!title || title === item.title) return
  rowEdits.update(item, { title })
}

async function updateInput(item: DatabaseItemDTO, field: DatabaseFieldDTO, event: Event) {
  const raw = inputValue(event)
  const value: DatabaseValue = field.type === 'number' ? (raw === '' ? null : Number(raw)) : (raw || null)
  if (item.values[field.id] === value) return
  rowEdits.update(item, { values: { [field.id]: value } })
}

async function updateFieldValue(item: DatabaseItemDTO, field: DatabaseFieldDTO, value: DatabaseValue) {
  if (item.values[field.id] === value) return
  rowEdits.update(item, { values: { [field.id]: value } })
}

function selectValue(item: DatabaseItemDTO, field: DatabaseFieldDTO): string | null {
  const value = item.values[field.id]
  return typeof value === 'string' ? value : null
}

function updateSelectValue(item: DatabaseItemDTO, field: DatabaseFieldDTO, value: unknown) {
  return updateFieldValue(item, field, typeof value === 'string' ? value : null)
}

function deleteItem(item: DatabaseItemDTO) {
  askConfirm(`Delete ${item.title}?`, async () => {
    const removed = await mutate(() => api(`/api/database-items/${item.id}`, { method: 'DELETE' }))
    if (removed) rowEdits.discard(item)
  })
}

function askConfirm(title: string, action: () => Promise<void>) {
  confirmTitle.value = title
  confirmAction.value = action
  showConfirm.value = true
}

async function confirmMutation() {
  if (!confirmAction.value) return
  await confirmAction.value()
  showConfirm.value = false
  confirmAction.value = null
}

function fieldIcon(type: DatabaseFieldType) {
  if (type === 'number') return 'i-ph-hash'
  if (type === 'boolean') return 'i-ph-check-square'
  if (type === 'date') return 'i-ph-calendar-blank'
  if (type === 'select') return 'i-ph-caret-circle-down'
  return 'i-ph-text-t'
}

function fieldMenu(field: DatabaseFieldDTO) {
  const fields = activeDatabase.value?.fields ?? []
  const index = fields.findIndex(candidate => candidate.id === field.id)
  return [[
    { label: 'Edit', icon: 'i-ph-pencil-simple', onSelect: () => openEditField(field) },
    { label: 'Move left', icon: 'i-ph-arrow-left', disabled: index <= 0, onSelect: () => moveField(field, -1) },
    { label: 'Move right', icon: 'i-ph-arrow-right', disabled: index < 0 || index >= fields.length - 1, onSelect: () => moveField(field, 1) },
  ], [
    { label: 'Delete', icon: 'i-ph-trash', color: 'error' as const, onSelect: () => deleteField(field) },
  ]]
}

const databaseMenu = computed(() => [[
  { label: 'Rename', icon: 'i-ph-pencil-simple', onSelect: openRenameDatabase },
], [
  { label: activeDatabase.value?.archivedAt ? 'Restore' : 'Archive', icon: 'i-ph-archive', onSelect: archiveDatabase },
  { label: 'Delete', icon: 'i-ph-trash', color: 'error' as const, onSelect: deleteDatabase },
]])
</script>

<template>
  <div class="flex h-full min-h-0 min-w-0 flex-col">
    <main class="flex min-h-0 min-w-0 flex-1 flex-col">
      <header class="flex h-12 shrink-0 items-center gap-2 px-4 shadow-[0_1px_0_var(--ui-border)]">
        <UIcon name="i-ph-table" class="size-5" />
        <span class="truncate font-semibold">{{ activeDatabase?.name || 'Data' }}</span>
        <UBadge v-if="showArchived" label="Archived" color="neutral" variant="subtle" size="sm" />
        <div class="ml-auto flex items-center gap-1">
          <UDropdownMenu v-if="activeDatabase" :items="databaseMenu">
            <UButton color="neutral" variant="ghost" icon="i-ph-dots-three" aria-label="Database actions" />
          </UDropdownMenu>
          <UButton v-if="!showArchived" icon="i-ph-plus" label="Record" :disabled="!activeDatabase" @click="addItem" />
        </div>
      </header>

      <div v-if="databasesQ.isPending.value" class="p-6"><USkeleton class="h-64" /></div>
      <UAlert v-else-if="databasesQ.error.value" color="error" title="Could not load databases." class="m-6" />
      <div v-else-if="!activeDatabase" class="grid flex-1 place-items-center p-6">
        <UButton v-if="!showArchived" icon="i-ph-plus" label="Create first database" @click="openCreateDatabase" />
        <span v-else class="text-sm text-muted">Nothing archived</span>
      </div>
      <template v-else>
        <div class="flex shrink-0 flex-wrap items-center gap-2 border-b border-default px-3 py-2">
          <UInput v-model="search" icon="i-ph-magnifying-glass" placeholder="Filter records" class="min-w-48 flex-1 sm:max-w-72" />
          <USelect v-model="sortKey" :items="sortOptions" aria-label="Sort field" class="w-40" />
          <UButton
            color="neutral"
            variant="soft"
            :icon="sortDirection === 'asc' ? 'i-ph-sort-ascending' : 'i-ph-sort-descending'"
            :aria-label="sortDirection === 'asc' ? 'Sort ascending' : 'Sort descending'"
            @click="sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'"
          />
          <UButton v-if="!showArchived" color="neutral" variant="soft" icon="i-ph-plus" label="Field" @click="openCreateField" />
        </div>

        <UAlert v-for="item in [...rowEdits.edits.values()].filter(edit => edit.item.databaseId === activeDatabase?.id && edit.error).map(edit => edit.item)" :key="item.id" color="error" :title="`${item.title}: changes not saved`" :description="errorMessage(rowEdits.edits.get(item.id)?.error)" class="mx-3 my-2">
          <template #actions>
            <UButton label="Save my changes" color="error" variant="soft" @click="retryItem(item)" />
            <UButton label="Discard my changes" color="neutral" variant="outline" @click="rowEdits.discard(item)" />
          </template>
        </UAlert>
        <div class="min-h-0 flex-1 overflow-auto">
          <table class="min-w-max border-separate border-spacing-0 text-sm">
            <thead class="sticky top-0 z-10 bg-default">
              <tr>
                <th class="sticky start-0 z-20 w-12 border-b border-e border-default bg-muted px-3 py-2 text-start text-xs font-medium text-muted">#</th>
                <th class="sticky start-12 z-20 min-w-64 border-b border-e border-default bg-muted px-2 py-1.5 text-start">
                  <span class="flex items-center gap-1.5 text-xs font-medium text-muted"><UIcon name="i-ph-text-t" class="size-4" />Title</span>
                </th>
                <th v-for="field in activeDatabase.fields" :key="field.id" class="min-w-48 border-b border-e border-default bg-muted px-2 py-1.5 text-start">
                  <div class="flex items-center gap-1">
                    <UIcon :name="fieldIcon(field.type)" class="size-4 shrink-0 text-dimmed" />
                    <span class="min-w-0 flex-1 truncate text-xs font-medium text-muted">{{ field.name }}</span>
                    <UDropdownMenu v-if="!showArchived" :items="fieldMenu(field)">
                      <UButton color="neutral" variant="ghost" size="xs" icon="i-ph-dots-three" :aria-label="`${field.name} actions`" />
                    </UDropdownMenu>
                  </div>
                </th>
                <th class="sticky end-0 z-20 w-12 border-b border-default bg-muted" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in visibleItems" :key="item.id" class="group">
                <td class="sticky start-0 z-[2] border-b border-e border-default bg-default px-3 text-xs text-dimmed group-hover:bg-elevated">{{ index + 1 }}</td>
                <td class="sticky start-12 z-[2] border-b border-e border-default bg-default p-1 group-hover:bg-elevated">
                  <div class="flex items-center gap-1">
                    <UInput
                      :model-value="item.title"
                      aria-label="Record title"
                      :disabled="showArchived"
                      class="min-w-56 flex-1"
                      @change="updateTitle(item, $event)"
                    />
                    <UIcon v-if="rowEdits.edits.get(item.id)?.saving" name="i-ph-spinner-gap" class="size-4 animate-spin text-primary" />
                  </div>
                </td>
                <td v-for="field in activeDatabase.fields" :key="field.id" class="border-b border-e border-default p-1 group-hover:bg-elevated/50">
                  <div class="flex min-h-8 items-center gap-1">
                    <UCheckbox
                      v-if="field.type === 'boolean'"
                      :model-value="Boolean(item.values[field.id])"
                      :disabled="showArchived"
                      :aria-label="field.name"
                      @update:model-value="updateFieldValue(item, field, Boolean($event))"
                    />
                    <USelect
                      v-else-if="field.type === 'select'"
                      :model-value="selectValue(item, field)"
                      :aria-label="field.name"
                      :items="[{ label: 'None', value: null }, ...field.options.map(option => ({ label: option, value: option }))]"
                      :disabled="showArchived"
                      class="w-full min-w-44"
                      @update:model-value="updateSelectValue(item, field, $event)"
                    />
                    <UInput
                      v-else
                      :model-value="displayValue(item.values[field.id])"
                      :aria-label="field.name"
                      :type="field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'"
                      :disabled="showArchived"
                      class="w-full min-w-44"
                      @change="updateInput(item, field, $event)"
                    />
                    <UIcon v-if="rowEdits.edits.get(item.id)?.saving" name="i-ph-spinner-gap" class="size-4 animate-spin text-primary" />
                  </div>
                </td>
                <td class="sticky end-0 border-b border-default bg-default px-1 group-hover:bg-elevated">
                  <UButton v-if="!showArchived" color="error" variant="ghost" size="xs" icon="i-ph-trash" :aria-label="`Delete ${item.title}`" :disabled="rowEdits.edits.get(item.id)?.saving" @click="deleteItem(item)" />
                </td>
              </tr>
              <tr v-if="!visibleItems.length">
                <td :colspan="activeDatabase.fields.length + 3" class="px-6 py-16 text-center text-sm text-muted">
                  {{ search ? 'No matching records' : 'No records' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </main>

    <UModal v-model:open="showDatabaseForm" :title="editingDatabaseId ? 'Rename database' : 'Create database'">
      <template #body>
        <UFormField label="Name"><UInput v-model="databaseName" autofocus class="w-full" @keyup.enter="saveDatabase" /></UFormField>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" label="Cancel" @click="showDatabaseForm = false" />
        <UButton label="Save" :loading="saving" :disabled="!databaseName.trim()" @click="saveDatabase" />
      </template>
    </UModal>

    <UModal v-model:open="showFieldForm" :title="editingFieldId ? 'Edit field' : 'Create field'">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name"><UInput v-model="fieldName" autofocus class="w-full" /></UFormField>
          <UFormField label="Type" :hint="`${DatabaseSlotCounts[fieldType]} available per database`">
            <USelect v-model="fieldType" :items="fieldTypeOptions" :disabled="Boolean(editingFieldId)" class="w-full" />
          </UFormField>
          <UFormField v-if="fieldType === 'select'" label="Options" description="Separate options with commas.">
            <UInput v-model="fieldOptions" placeholder="New, In progress, Done" class="w-full" @keyup.enter="saveField" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" label="Cancel" @click="showFieldForm = false" />
        <UButton label="Save" :loading="saving" :disabled="!fieldName.trim()" @click="saveField" />
      </template>
    </UModal>

    <UModal v-model:open="showConfirm" :title="confirmTitle">
      <template #body><p class="text-sm text-muted">This cannot be undone.</p></template>
      <template #footer>
        <UButton color="neutral" variant="ghost" label="Cancel" @click="showConfirm = false" />
        <UButton color="error" label="Delete" :loading="saving" @click="confirmMutation" />
      </template>
    </UModal>
  </div>
</template>
