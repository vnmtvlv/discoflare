<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { refDebounced } from '@vueuse/core'
import { DatabaseFieldTypes, DatabaseSlotCounts, DatabaseViewFilterOperators, DatabaseViewLayouts, defaultDatabaseViewConfig, type DatabaseFieldType, type DatabaseValue, type DatabaseViewFilter, type DatabaseViewFilterOperator, type DatabaseViewLayout, type DatabaseViewSort } from '~~/shared/database'
import { databasePath } from '~~/shared/paths'
import type { DataResourcesDTO, DatabaseDTO, DatabaseFieldDTO, DatabaseItemDTO, DatabasePageDTO, DatabaseViewDTO } from '~~/shared/types'

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
const selectedViewId = computed({
  get: () => String(route.query.view || '') || null,
  set: value => void navigateTo(databasePath(selectedDatabaseId.value, showArchived.value, value)),
})
const resourcesQ = useQuery({
  queryKey: computed(() => ['data-resources', workspaceId.value]),
  queryFn: () => api<DataResourcesDTO>(`/api/workspaces/${workspaceId.value}/data-resources`),
  enabled: computed(() => Boolean(workspaceId.value)),
  refetchInterval: 10_000,
})
const allDatabases = computed(() => resourcesQ.data.value?.databases ?? [])
const databases = computed(() => allDatabases.value.filter(database => Boolean(database.archivedAt) === showArchived.value))
const activeDatabaseSummary = computed(() => databases.value.find(database => database.id === selectedDatabaseId.value) ?? databases.value[0] ?? null)

const search = ref('')
const debouncedSearch = refDebounced(search, 250)
const page = ref(1)
const pageSize = 100
const calendarCursor = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
function localDateKey(date: Date) {
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
const calendarRange = computed(() => {
  const from = new Date(calendarCursor.value.getFullYear(), calendarCursor.value.getMonth(), 1)
  from.setDate(from.getDate() - from.getDay())
  const to = new Date(from)
  to.setDate(from.getDate() + 41)
  return { from: localDateKey(from), to: localDateKey(to) }
})
const databaseQ = useQuery({
  queryKey: computed(() => ['database', activeDatabaseSummary.value?.id, selectedViewId.value, debouncedSearch.value, page.value, calendarRange.value.from, calendarRange.value.to]),
  queryFn: () => api<DatabasePageDTO>(`/api/databases/${activeDatabaseSummary.value!.id}`, {
    query: {
      view: selectedViewId.value || undefined,
      search: debouncedSearch.value,
      page: page.value,
      pageSize,
      dateFrom: calendarRange.value.from,
      dateTo: calendarRange.value.to,
    },
  }),
  enabled: computed(() => Boolean(activeDatabaseSummary.value?.id)),
  refetchInterval: 10_000,
})
const activeDatabase = computed<DatabaseDTO | null>(() => databaseQ.data.value
  ? { ...databaseQ.data.value.database, items: databaseQ.data.value.items }
  : null)
const views = computed(() => databaseQ.data.value?.views ?? [])
const activeView = computed(() => databaseQ.data.value?.view ?? null)
const visibleFields = computed(() => {
  const fields = activeDatabase.value?.fields ?? []
  const visible = activeView.value?.config.visibleFieldIds
  return visible === null || visible === undefined ? fields : fields.filter(field => visible.includes(field.id))
})
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
  const result = await databaseQ.refetch()
  const latest = result.data?.items.find(candidate => candidate.id === item.id)
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
const showViewForm = ref(false)
const editingViewId = ref<string | null>(null)
const viewName = ref('')
const viewLayout = ref<DatabaseViewLayout>('table')
const viewVisibleFieldIds = ref<string[]>([])
type EditableViewFilter = { fieldId: string, operator: DatabaseViewFilterOperator, value: string }
const viewSorts = ref<DatabaseViewSort[]>([])
const viewFilters = ref<EditableViewFilter[]>([])
const viewGroupFieldId = ref('')
const viewDateFieldId = ref('')
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
const visibleItems = computed(() => activeDatabase.value?.items.map(rowEdits.display) ?? [])
const selectFields = computed(() => activeDatabase.value?.fields.filter(field => field.type === 'select') ?? [])
const dateFields = computed(() => activeDatabase.value?.fields.filter(field => field.type === 'date') ?? [])
const layoutOptions = DatabaseViewLayouts.map(layout => ({ label: layout.charAt(0).toUpperCase() + layout.slice(1), value: layout }))
const boardField = computed(() => activeDatabase.value?.fields.find(field => field.id === activeView.value?.config.groupFieldId) ?? null)
const boardGroups = computed(() => {
  const field = boardField.value
  if (!field) return []
  const counts = databaseQ.data.value?.groupCounts ?? {}
  return [...field.options.map(option => ({ key: option, label: option, total: counts[option] ?? 0, items: visibleItems.value.filter(item => item.values[field.id] === option) })), {
    key: '', label: 'No value', total: counts[''] ?? 0, items: visibleItems.value.filter(item => !item.values[field.id]),
  }]
})
const calendarDays = computed(() => {
  const start = new Date(`${calendarRange.value.from}T00:00:00`)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    const key = localDateKey(date)
    const fieldId = activeView.value?.config.dateFieldId
    return { date, key, current: date.getMonth() === calendarCursor.value.getMonth(), items: fieldId ? visibleItems.value.filter(item => item.values[fieldId] === key) : [] }
  })
})
const calendarTitle = computed(() => calendarCursor.value.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))
function filterField(filter: EditableViewFilter) {
  return activeDatabase.value?.fields.find(field => field.id === filter.fieldId) ?? null
}
function filterOperatorOptions(filter: EditableViewFilter) {
  const type = filter.fieldId === 'title' ? 'text' : filterField(filter)?.type
  return DatabaseViewFilterOperators.filter((operator) => {
    if (['equals', 'not_equals', 'is_empty', 'is_not_empty'].includes(operator)) return true
    if (operator === 'contains') return type === 'text' || type === 'select'
    if (operator === 'greater_than' || operator === 'less_than') return type === 'number'
    return type === 'date'
  }).map(operator => ({ label: operator.replaceAll('_', ' '), value: operator }))
}
function normalizeEditableFilter(filter: EditableViewFilter) {
  const allowed = filterOperatorOptions(filter)
  if (!allowed.some(option => option.value === filter.operator)) filter.operator = 'equals'
  const field = filterField(filter)
  if (field?.type === 'boolean' && !['true', 'false'].includes(filter.value)) filter.value = ''
  if (filterUsesSelectChoice(filter) && !field?.options.includes(filter.value)) filter.value = ''
}
function filterNeedsValue(filter: EditableViewFilter) {
  return !['is_empty', 'is_not_empty'].includes(filter.operator)
}
function filterUsesSelectChoice(filter: EditableViewFilter) {
  return filterNeedsValue(filter) && filterField(filter)?.type === 'select' && filter.operator !== 'contains'
}
const canSaveView = computed(() => Boolean(
  viewName.value.trim()
  && viewFilters.value.every(filter => filter.fieldId && (!filterNeedsValue(filter) || filter.value !== ''))
  && viewSorts.value.every(sort => sort.fieldId)
  && (viewLayout.value !== 'board' || viewGroupFieldId.value)
  && (viewLayout.value !== 'calendar' || viewDateFieldId.value),
))
const draggedItemId = ref<string | null>(null)

watch([databases, selectedDatabaseId], ([list, id]) => {
  if (!id || !list.length || list.some(database => database.id === id)) return
  selectedDatabaseId.value = list[0]?.id ?? null
}, { immediate: true })

watch([activeDatabaseSummary, selectedViewId], ([database, viewId]) => {
  const first = database?.views[0]
  if (database && first && (!viewId || !database.views.some(view => view.id === viewId))) {
    void navigateTo(databasePath(database.id, showArchived.value, first.id), { replace: true })
  }
}, { immediate: true })
watch([selectedDatabaseId, selectedViewId, debouncedSearch], () => { page.value = 1 })

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

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value
}

async function refresh() {
  await Promise.all([qc.invalidateQueries({ queryKey: ['database'] }), qc.invalidateQueries({ queryKey: ['data-resources'] })])
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

function openCreateView() {
  const fields = activeDatabase.value?.fields ?? []
  editingViewId.value = null
  viewName.value = ''
  viewLayout.value = 'table'
  viewVisibleFieldIds.value = fields.map(field => field.id)
  viewSorts.value = [{ fieldId: 'title', direction: 'asc' }]
  viewFilters.value = []
  viewGroupFieldId.value = selectFields.value[0]?.id ?? ''
  viewDateFieldId.value = dateFields.value[0]?.id ?? ''
  showViewForm.value = true
}

function openEditView(view: DatabaseViewDTO) {
  const fields = activeDatabase.value?.fields ?? []
  editingViewId.value = view.id
  viewName.value = view.name
  viewLayout.value = view.layout
  viewVisibleFieldIds.value = view.config.visibleFieldIds === null ? fields.map(field => field.id) : [...view.config.visibleFieldIds]
  viewSorts.value = view.config.sorts.map(sort => ({ ...sort }))
  viewFilters.value = view.config.filters.map(filter => ({
    fieldId: filter.fieldId,
    operator: filter.operator,
    value: filter.value === undefined || filter.value === null ? '' : String(filter.value),
  }))
  viewGroupFieldId.value = view.config.groupFieldId ?? ''
  viewDateFieldId.value = view.config.dateFieldId ?? ''
  showViewForm.value = true
}

function filterValue(filter: EditableViewFilter): DatabaseValue {
  const field = filterField(filter)
  if (field?.type === 'number') return Number(filter.value)
  if (field?.type === 'boolean') return filter.value === 'true'
  return filter.value
}

function addViewFilter() {
  if (viewFilters.value.length >= 8) return
  viewFilters.value.push({ fieldId: 'title', operator: 'contains', value: '' })
}

function addViewSort() {
  if (viewSorts.value.length >= 3) return
  viewSorts.value.push({ fieldId: 'title', direction: 'asc' })
}

async function saveView() {
  const database = activeDatabase.value
  const name = viewName.value.trim()
  if (!database || !name) return
  const current = editingViewId.value ? views.value.find(view => view.id === editingViewId.value) : null
  const allFieldIds = database.fields.map(field => field.id)
  const config = defaultDatabaseViewConfig()
  config.visibleFieldIds = viewVisibleFieldIds.value.length === allFieldIds.length ? null : [...viewVisibleFieldIds.value]
  config.sorts = viewSorts.value.map(sort => ({ ...sort }))
  config.filters = viewFilters.value.map((filter): DatabaseViewFilter => ({
    fieldId: filter.fieldId,
    operator: filter.operator,
    ...(filterNeedsValue(filter) ? { value: filterValue(filter) } : {}),
  }))
  config.groupFieldId = viewLayout.value === 'board' ? viewGroupFieldId.value || null : null
  config.dateFieldId = viewLayout.value === 'calendar' ? viewDateFieldId.value || null : null
  let createdId: string | null = null
  const ok = await mutate(async () => {
    if (current) {
      await api(`/api/database-views/${current.id}`, { method: 'PATCH', body: { name, layout: viewLayout.value, config, version: current.version } })
    }
    else {
      const result = await api<{ view: DatabaseViewDTO }>(`/api/databases/${database.id}/views`, { method: 'POST', body: { name, layout: viewLayout.value, config } })
      createdId = result.view.id
    }
  }, current ? 'View updated' : 'View created')
  if (!ok) return
  showViewForm.value = false
  if (createdId) await navigateTo(databasePath(database.id, false, createdId))
}

function deleteView(view: DatabaseViewDTO) {
  askConfirm(`Delete ${view.name}?`, async () => {
    const removed = await mutate(() => api(`/api/database-views/${view.id}`, { method: 'DELETE' }), 'View deleted')
    if (removed) {
      const next = views.value.find(candidate => candidate.id !== view.id)
      await navigateTo(databasePath(view.databaseId, false, next?.id), { replace: true })
    }
  })
}

function toggleVisibleField(fieldId: string, visible: boolean) {
  viewVisibleFieldIds.value = visible
    ? [...new Set([...viewVisibleFieldIds.value, fieldId])]
    : viewVisibleFieldIds.value.filter(id => id !== fieldId)
}

function changeCalendarMonth(direction: -1 | 1) {
  calendarCursor.value = new Date(calendarCursor.value.getFullYear(), calendarCursor.value.getMonth() + direction, 1)
  page.value = 1
}

function dropBoard(group: string) {
  const item = visibleItems.value.find(candidate => candidate.id === draggedItemId.value)
  const field = boardField.value
  draggedItemId.value = null
  if (item && field) void updateFieldValue(item, field, group || null)
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

function viewIcon(layout: DatabaseViewLayout) {
  if (layout === 'board') return 'i-ph-kanban'
  if (layout === 'calendar') return 'i-ph-calendar-blank'
  if (layout === 'list') return 'i-ph-list-bullets'
  return 'i-ph-table'
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
const viewMenu = computed(() => activeView.value ? [[
  { label: 'View settings', icon: 'i-ph-sliders-horizontal', onSelect: () => openEditView(activeView.value!) },
], [
  { label: 'Delete view', icon: 'i-ph-trash', color: 'error' as const, disabled: views.value.length <= 1, onSelect: () => deleteView(activeView.value!) },
]] : [])
</script>

<template>
  <div class="flex h-full min-h-0 min-w-0 flex-col">
    <main class="flex min-h-0 min-w-0 flex-1 flex-col">
      <header class="flex h-12 shrink-0 items-center gap-2 px-4 shadow-[0_1px_0_var(--ui-border)]">
        <UIcon :name="activeView ? viewIcon(activeView.layout) : 'i-ph-table'" class="size-5" />
        <span class="truncate font-semibold">{{ activeDatabase?.name || 'Data' }}</span>
        <UBadge v-if="showArchived" label="Archived" color="neutral" variant="subtle" size="sm" />
        <div class="ml-auto flex items-center gap-1">
          <DataBookmarkButton v-if="activeView" :workspace-id="workspaceId" target-type="database_view" :target-id="activeView.id" />
          <UDropdownMenu v-if="activeDatabase" :items="databaseMenu">
            <UButton color="neutral" variant="ghost" icon="i-ph-dots-three" aria-label="Database actions" />
          </UDropdownMenu>
          <UButton v-if="!showArchived" icon="i-ph-plus" label="Record" :disabled="!activeDatabase" @click="addItem" />
        </div>
      </header>

      <div v-if="resourcesQ.isPending.value || (activeDatabaseSummary && databaseQ.isPending.value)" class="p-6"><USkeleton class="h-64" /></div>
      <UAlert v-else-if="resourcesQ.error.value || databaseQ.error.value" color="error" title="Could not load databases." class="m-6" />
      <div v-else-if="!activeDatabase" class="grid flex-1 place-items-center p-6">
        <UButton v-if="!showArchived" icon="i-ph-plus" label="Create first database" @click="openCreateDatabase" />
        <span v-else class="text-sm text-muted">Nothing archived</span>
      </div>
      <template v-else-if="activeView">
        <div class="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-default px-3 py-1.5">
          <UButton
            v-for="view in views"
            :key="view.id"
            :label="view.name"
            :icon="viewIcon(view.layout)"
            :color="view.id === activeView.id ? 'primary' : 'neutral'"
            :variant="view.id === activeView.id ? 'soft' : 'ghost'"
            size="sm"
            @click="navigateTo(databasePath(activeDatabase.id, showArchived, view.id))"
          />
          <UButton v-if="!showArchived" color="neutral" variant="ghost" size="sm" icon="i-ph-plus" aria-label="Create view" @click="openCreateView" />
        </div>

        <div class="flex shrink-0 flex-wrap items-center gap-2 border-b border-default px-3 py-2">
          <UInput v-model="search" icon="i-ph-magnifying-glass" placeholder="Search this view" class="min-w-48 flex-1 sm:max-w-72" />
          <UBadge v-if="activeView.config.filters.length" color="neutral" variant="subtle" :label="`${activeView.config.filters.length} filter`" />
          <UBadge v-if="activeView.config.sorts.length" color="neutral" variant="subtle" :label="`${activeView.config.sorts.length} sort`" />
          <UDropdownMenu v-if="!showArchived" :items="viewMenu">
            <UButton color="neutral" variant="soft" icon="i-ph-sliders-horizontal" label="View" />
          </UDropdownMenu>
          <UButton v-if="!showArchived" color="neutral" variant="soft" icon="i-ph-plus" label="Field" @click="openCreateField" />
        </div>

        <UAlert v-for="item in [...rowEdits.edits.values()].filter(edit => edit.item.databaseId === activeDatabase?.id && edit.error).map(edit => edit.item)" :key="item.id" color="error" :title="`${item.title}: changes not saved`" :description="errorMessage(rowEdits.edits.get(item.id)?.error)" class="mx-3 my-2">
          <template #actions>
            <UButton label="Save my changes" color="error" variant="soft" @click="retryItem(item)" />
            <UButton label="Discard my changes" color="neutral" variant="outline" @click="rowEdits.discard(item)" />
          </template>
        </UAlert>

        <div v-if="!visibleItems.length && activeView.layout !== 'calendar'" class="grid min-h-0 flex-1 place-items-center p-6 text-sm text-muted">{{ search ? 'No matching records' : 'No records in this view' }}</div>
        <div v-else-if="activeView.layout === 'table'" class="min-h-0 flex-1 overflow-auto">
          <table class="min-w-max border-separate border-spacing-0 text-sm">
            <thead class="sticky top-0 z-10 bg-default">
              <tr>
                <th class="sticky start-0 z-20 w-12 border-b border-e border-default bg-muted px-3 py-2 text-start text-xs font-medium text-muted">#</th>
                <th class="sticky start-12 z-20 min-w-64 border-b border-e border-default bg-muted px-2 py-1.5 text-start"><span class="flex items-center gap-1.5 text-xs font-medium text-muted"><UIcon name="i-ph-text-t" class="size-4" />Title</span></th>
                <th v-for="field in visibleFields" :key="field.id" class="min-w-48 border-b border-e border-default bg-muted px-2 py-1.5 text-start">
                  <div class="flex items-center gap-1">
                    <UIcon :name="fieldIcon(field.type)" class="size-4 shrink-0 text-dimmed" />
                    <span class="min-w-0 flex-1 truncate text-xs font-medium text-muted">{{ field.name }}</span>
                    <UDropdownMenu v-if="!showArchived" :items="fieldMenu(field)"><UButton color="neutral" variant="ghost" size="xs" icon="i-ph-dots-three" :aria-label="`${field.name} actions`" /></UDropdownMenu>
                  </div>
                </th>
                <th class="sticky end-0 z-20 w-12 border-b border-default bg-muted" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in visibleItems" :key="item.id" class="group">
                <td class="sticky start-0 z-[2] border-b border-e border-default bg-default px-3 text-xs text-dimmed group-hover:bg-elevated">{{ (page - 1) * pageSize + index + 1 }}</td>
                <td class="sticky start-12 z-[2] border-b border-e border-default bg-default p-1 group-hover:bg-elevated">
                  <div class="flex items-center gap-1"><UInput :model-value="item.title" aria-label="Record title" :disabled="showArchived" class="min-w-56 flex-1" @change="updateTitle(item, $event)" /><UIcon v-if="rowEdits.edits.get(item.id)?.saving" name="i-ph-spinner-gap" class="size-4 animate-spin text-primary" /></div>
                </td>
                <td v-for="field in visibleFields" :key="field.id" class="border-b border-e border-default p-1 group-hover:bg-elevated/50">
                  <div class="flex min-h-8 items-center gap-1">
                    <UCheckbox v-if="field.type === 'boolean'" :model-value="Boolean(item.values[field.id])" :disabled="showArchived" :aria-label="field.name" @update:model-value="updateFieldValue(item, field, Boolean($event))" />
                    <USelect v-else-if="field.type === 'select'" :model-value="selectValue(item, field)" :aria-label="field.name" :items="[{ label: 'None', value: null }, ...field.options.map(option => ({ label: option, value: option }))]" :disabled="showArchived" class="w-full min-w-44" @update:model-value="updateSelectValue(item, field, $event)" />
                    <UInput v-else :model-value="displayValue(item.values[field.id])" :aria-label="field.name" :type="field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'" :disabled="showArchived" class="w-full min-w-44" @change="updateInput(item, field, $event)" />
                    <UIcon v-if="rowEdits.edits.get(item.id)?.saving" name="i-ph-spinner-gap" class="size-4 animate-spin text-primary" />
                  </div>
                </td>
                <td class="sticky end-0 border-b border-default bg-default px-1 group-hover:bg-elevated"><UButton v-if="!showArchived" color="error" variant="ghost" size="xs" icon="i-ph-trash" :aria-label="`Delete ${item.title}`" :disabled="rowEdits.edits.get(item.id)?.saving" @click="deleteItem(item)" /></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else-if="activeView.layout === 'list'" class="min-h-0 flex-1 overflow-y-auto p-3">
          <div class="divide-y divide-default rounded-lg border border-default">
            <div v-for="item in visibleItems" :key="item.id" class="flex items-center gap-4 px-4 py-3 hover:bg-elevated">
              <UInput :model-value="item.title" variant="none" aria-label="Record title" :disabled="showArchived" class="min-w-48 flex-1" :ui="{ base: 'px-0 font-medium' }" @change="updateTitle(item, $event)" />
              <span v-for="field in visibleFields.slice(0, 3)" :key="field.id" class="hidden max-w-40 truncate text-xs text-muted sm:block">{{ displayValue(item.values[field.id]) || '—' }}</span>
              <UButton v-if="!showArchived" color="error" variant="ghost" size="xs" icon="i-ph-trash" :aria-label="`Delete ${item.title}`" @click="deleteItem(item)" />
            </div>
          </div>
        </div>

        <div v-else-if="activeView.layout === 'board'" class="min-h-0 flex-1 overflow-auto p-3">
          <div class="flex min-h-full min-w-max gap-3">
            <section v-for="group in boardGroups" :key="group.key" class="w-72 shrink-0 rounded-lg bg-muted/60 p-2" @dragover.prevent @drop="dropBoard(group.key)">
              <header class="mb-2 flex items-center gap-2 px-1 text-sm font-medium"><span>{{ group.label }}</span><span class="text-xs text-dimmed">{{ group.total }}</span></header>
              <div class="space-y-2">
                <article v-for="item in group.items" :key="item.id" :draggable="!showArchived" class="rounded-md border border-default bg-default p-3 shadow-sm" @dragstart="draggedItemId = item.id">
                  <p class="font-medium">{{ item.title }}</p>
                  <dl class="mt-2 space-y-1 text-xs text-muted"><div v-for="field in visibleFields.filter(field => field.id !== boardField?.id).slice(0, 3)" :key="field.id" class="flex gap-2"><dt class="shrink-0">{{ field.name }}</dt><dd class="ml-auto max-w-36 truncate text-default">{{ displayValue(item.values[field.id]) || '—' }}</dd></div></dl>
                </article>
              </div>
            </section>
          </div>
        </div>

        <div v-else class="min-h-0 flex-1 overflow-auto p-3">
          <div class="mb-3 flex items-center gap-2"><UButton color="neutral" variant="ghost" icon="i-ph-caret-left" aria-label="Previous month" @click="changeCalendarMonth(-1)" /><span class="min-w-40 text-center font-medium">{{ calendarTitle }}</span><UButton color="neutral" variant="ghost" icon="i-ph-caret-right" aria-label="Next month" @click="changeCalendarMonth(1)" /></div>
          <div class="grid min-w-[700px] grid-cols-7 border-s border-t border-default text-xs">
            <div v-for="day in ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']" :key="day" class="border-b border-e border-default bg-muted px-2 py-1.5 font-medium text-muted">{{ day }}</div>
            <div v-for="day in calendarDays" :key="day.key" class="min-h-28 border-b border-e border-default p-1.5" :class="day.current ? 'bg-default' : 'bg-muted/30 text-dimmed'">
              <span>{{ day.date.getDate() }}</span>
              <div class="mt-1 space-y-1"><div v-for="item in day.items" :key="item.id" class="truncate rounded bg-primary/10 px-1.5 py-1 text-default">{{ item.title }}</div></div>
            </div>
          </div>
          <p class="mt-2 text-xs text-muted">Records without a date remain available from a table or list view.</p>
        </div>

        <div v-if="databaseQ.data.value && databaseQ.data.value.total > pageSize" class="flex shrink-0 justify-end border-t border-default px-4 py-2"><UPagination v-model:page="page" :total="databaseQ.data.value.total" :items-per-page="pageSize" /></div>
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

    <UModal v-model:open="showViewForm" :title="editingViewId ? 'View settings' : 'Create view'">
      <template #body>
        <div class="space-y-5">
          <UFormField label="Name"><UInput v-model="viewName" autofocus class="w-full" /></UFormField>
          <UFormField label="Layout"><USelect v-model="viewLayout" :items="layoutOptions" class="w-full" /></UFormField>
          <UFormField v-if="viewLayout === 'board'" label="Group cards by">
            <USelect v-model="viewGroupFieldId" :items="selectFields.map(field => ({ label: field.name, value: field.id }))" placeholder="Choose a Select field" class="w-full" />
            <p v-if="!selectFields.length" class="mt-1 text-xs text-warning">Create a Select field before using a board.</p>
          </UFormField>
          <UFormField v-if="viewLayout === 'calendar'" label="Date field">
            <USelect v-model="viewDateFieldId" :items="dateFields.map(field => ({ label: field.name, value: field.id }))" placeholder="Choose a Date field" class="w-full" />
            <p v-if="!dateFields.length" class="mt-1 text-xs text-warning">Create a Date field before using a calendar.</p>
          </UFormField>

          <fieldset>
            <legend class="mb-2 text-sm font-medium">Visible fields</legend>
            <div v-if="activeDatabase?.fields.length" class="grid grid-cols-2 gap-2">
              <UCheckbox
                v-for="field in activeDatabase.fields"
                :key="field.id"
                :label="field.name"
                :model-value="viewVisibleFieldIds.includes(field.id)"
                @update:model-value="toggleVisibleField(field.id, Boolean($event))"
              />
            </div>
            <p v-else class="text-xs text-muted">This database has no custom fields.</p>
          </fieldset>

          <fieldset class="space-y-2">
            <legend class="text-sm font-medium">Filters</legend>
            <div class="flex justify-end">
              <UButton color="neutral" variant="ghost" size="xs" icon="i-ph-plus" label="Add filter" :disabled="viewFilters.length >= 8" @click="addViewFilter" />
            </div>
            <div v-for="(filter, index) in viewFilters" :key="index" class="space-y-2 rounded-md border border-default p-2">
              <div class="flex gap-2">
                <USelect v-model="filter.fieldId" :items="sortOptions" class="min-w-0 flex-1" @update:model-value="normalizeEditableFilter(filter)" />
                <UButton color="neutral" variant="ghost" icon="i-ph-x" aria-label="Remove filter" @click="viewFilters.splice(index, 1)" />
              </div>
              <USelect v-model="filter.operator" :items="filterOperatorOptions(filter)" class="w-full" @update:model-value="normalizeEditableFilter(filter)" />
              <USelect
                v-if="filterNeedsValue(filter) && filterField(filter)?.type === 'boolean'"
                v-model="filter.value"
                :items="[{ label: 'Yes', value: 'true' }, { label: 'No', value: 'false' }]"
                class="w-full"
              />
              <USelect
                v-else-if="filterUsesSelectChoice(filter)"
                v-model="filter.value"
                :items="filterField(filter)?.options.map(option => ({ label: option, value: option })) ?? []"
                placeholder="Choose a value"
                class="w-full"
              />
              <UInput
                v-else-if="filterNeedsValue(filter)"
                v-model="filter.value"
                :type="filterField(filter)?.type === 'number' ? 'number' : filterField(filter)?.type === 'date' ? 'date' : 'text'"
                placeholder="Value"
                class="w-full"
              />
            </div>
            <p v-if="!viewFilters.length" class="text-xs text-muted">No filters</p>
          </fieldset>

          <fieldset class="space-y-2">
            <legend class="text-sm font-medium">Sorts</legend>
            <div class="flex justify-end">
              <UButton color="neutral" variant="ghost" size="xs" icon="i-ph-plus" label="Add sort" :disabled="viewSorts.length >= 3" @click="addViewSort" />
            </div>
            <div v-for="(sort, index) in viewSorts" :key="index" class="flex gap-2">
              <USelect v-model="sort.fieldId" :items="sortOptions" class="min-w-0 flex-1" />
              <USelect v-model="sort.direction" :items="[{ label: 'Ascending', value: 'asc' }, { label: 'Descending', value: 'desc' }]" class="w-36" />
              <UButton color="neutral" variant="ghost" icon="i-ph-x" aria-label="Remove sort" @click="viewSorts.splice(index, 1)" />
            </div>
            <p v-if="!viewSorts.length" class="text-xs text-muted">No sorting</p>
          </fieldset>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" label="Cancel" @click="showViewForm = false" />
        <UButton
          label="Save"
          :loading="saving"
          :disabled="!canSaveView"
          @click="saveView"
        />
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
