import { describe, expect, it } from 'vitest'
import { ALL_PERMISSIONS, hasPermission, MemberPermissions, Permission, rolePermissions } from '../../shared/permissions'

describe('permissions', () => {
  it('owner has every flag', () => {
    expect(hasPermission(ALL_PERMISSIONS, Permission.kick)).toBe(true)
    expect(hasPermission(ALL_PERMISSIONS, Permission.manageGuild)).toBe(true)
    expect(rolePermissions('owner')).toBe(ALL_PERMISSIONS)
  })

  it('member can send but not kick', () => {
    expect(hasPermission(MemberPermissions, Permission.sendMessages)).toBe(true)
    expect(hasPermission(MemberPermissions, Permission.kick)).toBe(false)
    expect(rolePermissions('member')).toBe(MemberPermissions)
  })
})
