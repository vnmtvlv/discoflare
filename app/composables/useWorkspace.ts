import { useQuery } from '@tanstack/vue-query'
import type { WorkspaceDTO } from '~~/shared/types'

export function useWorkspace() {
  const { api } = useApi()
  const workspacesQ = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api<{ workspaces: WorkspaceDTO[] }>('/api/workspaces'),
  })
  const workspace = computed(() => workspacesQ.data.value?.workspaces[0] ?? null)
  const workspaceId = computed(() => workspace.value?.id ?? '')
  return { workspacesQ, workspace, workspaceId }
}
