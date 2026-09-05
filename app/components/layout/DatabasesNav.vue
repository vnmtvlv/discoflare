<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { canvasPath, databasePath, documentPath } from '~~/shared/paths'
import type { DataResourcesDTO } from '~~/shared/types'

const props = defineProps<{ workspaceId: string }>()
const route = useRoute()
const { api } = useApi()
const nav = useNavActions()

const archived = computed(() => route.path === '/databases' && route.query.archived === '1')
const resourcesQ = useQuery({
  queryKey: computed(() => ['data-resources', props.workspaceId]),
  queryFn: () => api<DataResourcesDTO>(`/api/workspaces/${props.workspaceId}/data-resources`),
  enabled: computed(() => Boolean(props.workspaceId)),
  refetchInterval: 10_000,
})
const databases = computed(() => {
  const list = resourcesQ.data.value?.databases ?? []
  return list.filter(database => Boolean(database.archivedAt) === archived.value)
})
const documents = computed(() => resourcesQ.data.value?.documents ?? [])
const canvases = computed(() => resourcesQ.data.value?.canvases ?? [])
const activeDatabaseId = computed(() => route.path === '/databases' ? String(route.query.database || '') || databases.value[0]?.id || '' : '')
const activeDocumentId = computed(() => route.path === '/documents' ? String(route.query.document || '') || documents.value[0]?.id || '' : '')
const activeCanvasId = computed(() => route.path === '/canvases' ? String(route.query.canvas || '') || canvases.value[0]?.id || '' : '')
</script>

<template>
  <div class="space-y-1">
    <LayoutNavSection
      label="Databases"
      collapse-key="data:databases"
      :create-label="archived ? undefined : 'Create database'"
      @create="nav.createDatabaseOpen.value = true"
    >
      <USkeleton v-if="resourcesQ.isPending.value" class="h-12" />
      <p v-else-if="resourcesQ.error.value" class="px-2 py-2 text-sm text-error">Could not load Data.</p>
      <p v-else-if="!databases.length" class="px-2 py-2 text-sm text-muted">{{ archived ? 'Nothing archived.' : 'No databases yet.' }}</p>
      <ul v-else>
        <li v-for="database in databases" :key="database.id">
          <LayoutNavRow :to="databasePath(database.id, archived)" :active="database.id === activeDatabaseId">
            <template #leading><UIcon name="i-ph-table" class="size-[18px] shrink-0 text-dimmed" /></template>
            {{ database.name }}
            <template #trailing><span v-if="database.itemCount" class="shrink-0 text-[11px] text-dimmed">{{ database.itemCount }}</span></template>
          </LayoutNavRow>
        </li>
      </ul>
    </LayoutNavSection>

    <LayoutNavSection label="Docs" collapse-key="data:documents" create-label="Create document" @create="nav.createDocumentOpen.value = true">
      <USkeleton v-if="resourcesQ.isPending.value" class="h-12" />
      <p v-else-if="!documents.length" class="px-2 py-2 text-sm text-muted">No documents yet.</p>
      <ul v-else>
        <li v-for="document in documents" :key="document.id">
          <LayoutNavRow :to="documentPath(document.id)" :active="document.id === activeDocumentId">
            <template #leading><UIcon name="i-ph-file-text" class="size-[18px] shrink-0 text-dimmed" /></template>
            {{ document.title }}
          </LayoutNavRow>
        </li>
      </ul>
    </LayoutNavSection>

    <LayoutNavSection label="Canvases" collapse-key="data:canvases" create-label="Create canvas" @create="nav.createCanvasOpen.value = true">
      <USkeleton v-if="resourcesQ.isPending.value" class="h-12" />
      <p v-else-if="!canvases.length" class="px-2 py-2 text-sm text-muted">No canvases yet.</p>
      <ul v-else>
        <li v-for="canvas in canvases" :key="canvas.id">
          <LayoutNavRow :to="canvasPath(canvas.id)" :active="canvas.id === activeCanvasId">
            <template #leading><UIcon name="i-ph-selection-background" class="size-[18px] shrink-0 text-dimmed" /></template>
            {{ canvas.title }}
            <template #trailing><span v-if="canvas.nodeCount" class="shrink-0 text-[11px] text-dimmed">{{ canvas.nodeCount }}</span></template>
          </LayoutNavRow>
        </li>
      </ul>
    </LayoutNavSection>

    <div class="px-2 pt-2">
      <LayoutNavRow :to="databasePath(null, !archived)" :active="archived">
        <template #leading><UIcon name="i-ph-archive" class="size-[18px] shrink-0 text-dimmed" /></template>
        Archived databases
      </LayoutNavRow>
    </div>
  </div>
</template>
