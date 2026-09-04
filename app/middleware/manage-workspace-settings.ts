import { WORKSPACE_ID } from '~~/shared/ids'
import { hasPermission, Permission, type PermissionFlag } from '~~/shared/permissions'
import type { MemberDTO } from '~~/shared/types'

const settingsPermissions: PermissionFlag[] = [
  Permission.manageWorkspace,
  Permission.manageChannels,
  Permission.manageRoles,
  Permission.invite,
  Permission.kick,
]

export default defineNuxtRouteMiddleware(async () => {
  const session = useSessionStore()
  if (!session.user) return

  const { api, native } = useApi()
  const response = import.meta.client && native
    ? await api<{ members: MemberDTO[] }>(`/api/workspaces/${WORKSPACE_ID}/members`)
    : await useRequestFetch()<{ members: MemberDTO[] }>(`/api/workspaces/${WORKSPACE_ID}/members`)
  const { members } = response
  const member = members.find(item => item.user.id === session.user?.id)
  if (!member || (member.role.key !== 'owner' && !settingsPermissions.some(flag => hasPermission(member.role.permissions, flag)))) {
    return navigateTo('/channels')
  }
})
