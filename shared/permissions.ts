export const Permission = {
  manageWorkspace: 1 << 0,
  manageChannels: 1 << 1,
  manageRoles: 1 << 2,
  invite: 1 << 3,
  sendMessages: 1 << 4,
  attachFiles: 1 << 5,
  startHuddle: 1 << 6,
  kick: 1 << 7,
} as const

export type PermissionFlag = (typeof Permission)[keyof typeof Permission]

export const ALL_PERMISSIONS =
  Permission.manageWorkspace
  | Permission.manageChannels
  | Permission.manageRoles
  | Permission.invite
  | Permission.sendMessages
  | Permission.attachFiles
  | Permission.startHuddle
  | Permission.kick

export const MemberPermissions =
  Permission.sendMessages | Permission.attachFiles | Permission.startHuddle

export const PermissionGrants = [
  { key: 'manageWorkspace', flag: Permission.manageWorkspace, label: 'Manage workspace', description: 'Change workspace name and settings.' },
  { key: 'manageChannels', flag: Permission.manageChannels, label: 'Manage channels', description: 'Create, edit, and remove channels and categories.' },
  { key: 'manageRoles', flag: Permission.manageRoles, label: 'Manage roles', description: 'Create roles, change grants, and assign roles to members.' },
  { key: 'invite', flag: Permission.invite, label: 'Create invites', description: 'Invite new members to the workspace.' },
  { key: 'sendMessages', flag: Permission.sendMessages, label: 'Send messages', description: 'Post and reply in accessible channels.' },
  { key: 'attachFiles', flag: Permission.attachFiles, label: 'Attach files', description: 'Upload attachments to messages.' },
  { key: 'startHuddle', flag: Permission.startHuddle, label: 'Start huddles', description: 'Start voice huddles in channels and direct messages.' },
  { key: 'kick', flag: Permission.kick, label: 'Remove members', description: 'Remove members from the workspace.' },
] as const

export type PermissionGrantKey = (typeof PermissionGrants)[number]['key']

export function permissionBitmask(enabled: Iterable<PermissionGrantKey>): number {
  const keys = new Set(enabled)
  return PermissionGrants.reduce((bitmask, grant) => keys.has(grant.key) ? bitmask | grant.flag : bitmask, 0)
}

export function hasPermission(bitmask: number, flag: PermissionFlag): boolean {
  return (bitmask & flag) === flag
}

export function rolePermissions(name: string): number {
  if (name === 'owner' || name === 'admin') return ALL_PERMISSIONS
  return MemberPermissions
}
