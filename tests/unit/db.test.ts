import { describe, expect, it } from 'vitest'
import { INIT_SQL } from '../../server/utils/db'

describe('D1 bootstrap schema', () => {
  it('passes one complete statement per line to D1 exec', () => {
    const lines = INIT_SQL.trim().split('\n')

    expect(lines.length).toBeGreaterThan(1)
    expect(lines.every(line => line.trim().endsWith(';'))).toBe(true)
  })

  it('uses the singleton workspace and generalized private-channel model', () => {
    expect(INIT_SQL).toContain('CREATE TABLE IF NOT EXISTS `workspace`')
    expect(INIT_SQL).toContain('CREATE TABLE IF NOT EXISTS `users`')
    expect(INIT_SQL).not.toContain('CREATE TABLE IF NOT EXISTS `members`')
    expect(INIT_SQL).toContain('CREATE TABLE IF NOT EXISTS `channel_members`')
    expect(INIT_SQL).toContain('CREATE TABLE `channel_categories`')
    expect(INIT_SQL).toContain('`category_id` text REFERENCES channel_categories(id) ON DELETE SET NULL')
    expect(INIT_SQL).toContain('CREATE TABLE IF NOT EXISTS `auth_users`')
    expect(INIT_SQL).toContain('CREATE TABLE IF NOT EXISTS `auth_sessions`')
    expect(INIT_SQL).not.toContain('CREATE TABLE IF NOT EXISTS `sessions`')
    expect(INIT_SQL).not.toContain('password_hash')
    expect(INIT_SQL).not.toContain('guild_id')
    expect(INIT_SQL).not.toContain('dm_participants')
  })
})
