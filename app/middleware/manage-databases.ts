import { WORKSPACE_ID } from '~~/shared/ids'
import { hasPermission, Permission } from '~~/shared/permissions'
import type { MemberDTO } from '~~/shared/types'

export default defineNuxtRouteMiddleware(async () => {
  const session = useSessionStore()
  if (!session.user) return
  const { api, native } = useApi()
  const queryClient = useNuxtApp().$queryClient
  const queryKey = ['members', WORKSPACE_ID]
  let response = import.meta.client
    ? queryClient.getQueryData<{ members: MemberDTO[] }>(queryKey)
    : undefined
  if (!response) {
    response = import.meta.client && native
      ? await api<{ members: MemberDTO[] }>(`/api/workspaces/${WORKSPACE_ID}/members`)
      : await useRequestFetch()<{ members: MemberDTO[] }>(`/api/workspaces/${WORKSPACE_ID}/members`)
    if (import.meta.client) queryClient.setQueryData(queryKey, response)
  }
  const member = response.members.find(item => item.user.id === session.user?.id)
  if (!member || (member.role.key !== 'owner' && !hasPermission(member.role.permissions, Permission.manageDatabases))) {
    return navigateTo('/channels')
  }
})
