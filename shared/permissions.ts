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

export function hasPermission(bitmask: number, flag: PermissionFlag): boolean {
  return (bitmask & flag) === flag
}

export function rolePermissions(name: string): number {
  if (name === 'owner' || name === 'admin') return ALL_PERMISSIONS
  return MemberPermissions
}
