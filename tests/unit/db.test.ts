import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { d1ExecSql, INIT_SQL } from '../../server/utils/db'

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
    expect(INIT_SQL).toContain('CREATE VIRTUAL TABLE `message_search` USING fts5')
    expect(INIT_SQL).toContain('CREATE TRIGGER `message_search_after_update`')
    expect(INIT_SQL).toContain('CREATE TABLE `push_subscriptions`')
    expect(INIT_SQL).toContain('CREATE TABLE `notification_outbox`')
    expect(INIT_SQL).toContain('CREATE TABLE `message_pins`')
    expect(INIT_SQL).toContain('CREATE TABLE `channel_role_overrides`')
    expect(INIT_SQL).toContain('CREATE TABLE `agents`')
    expect(INIT_SQL).toContain('CREATE TABLE `task_boards`')
    expect(INIT_SQL).toContain('CREATE TABLE `tasks`')
    expect(INIT_SQL).toContain('CREATE TABLE `task_runs`')
    expect(INIT_SQL).not.toContain('CREATE TABLE IF NOT EXISTS `sessions`')
    expect(INIT_SQL).not.toContain('password_hash')
    expect(INIT_SQL).not.toContain('guild_id')
    expect(INIT_SQL).not.toContain('dm_participants')
  })

  it('keeps trigger bodies together as one D1 exec statement', () => {
    const sql = d1ExecSql(`
      CREATE TRIGGER example AFTER UPDATE ON messages BEGIN
        DELETE FROM derived WHERE id = OLD.id;
        INSERT INTO derived (id) VALUES (NEW.id);
      END;
      --> statement-breakpoint
      SELECT 1;
    `)
    const lines = sql.split('\n')

    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('DELETE FROM derived WHERE id = OLD.id; INSERT INTO derived')
    expect(lines[0]).toMatch(/END;$/u)
  })

  it('boots with constrained channel role overrides', () => {
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(INIT_SQL)

    sqlite.exec("INSERT INTO roles (id, key, name, permissions_bitmask) VALUES ('role', 'custom:role', 'Role', 0)")
    sqlite.exec("INSERT INTO channels (id, name, type, visibility) VALUES ('channel', 'Channel', 'text', 'workspace')")
    sqlite.exec("INSERT INTO channel_role_overrides (channel_id, role_id, allow_mask, deny_mask) VALUES ('channel', 'role', 16, 32)")

    expect(() => sqlite.exec(
      "INSERT INTO channel_role_overrides (channel_id, role_id, allow_mask, deny_mask) VALUES ('channel', 'role-2', 2, 0)",
    )).toThrow()
    expect(() => sqlite.exec(
      "INSERT INTO channel_role_overrides (channel_id, role_id, allow_mask, deny_mask) VALUES ('channel-2', 'role', 16, 16)",
    )).toThrow()
  })

  it('models an agent as a participant without creating a login identity', () => {
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(INIT_SQL)
    sqlite.exec("INSERT INTO roles (id, key, name, permissions_bitmask) VALUES ('member-role', 'member', 'member', 112)")
    sqlite.exec("INSERT INTO users (id, kind, display_name, status, role_id, joined_at) VALUES ('agent-1', 'agent', 'Builder', 'active', 'member-role', '2026-09-04T00:00:00.000Z')")
    sqlite.exec("INSERT INTO agents (user_id, sandbox_id, created_by) VALUES ('agent-1', 'agent-agent-1', 'agent-1')")
    sqlite.exec("INSERT INTO task_boards (id, name, created_by) VALUES ('board-1', 'Launch', 'agent-1')")
    sqlite.exec("INSERT INTO tasks (id, board_id, title, assignee_id, created_by) VALUES ('task-1', 'board-1', 'Ship it', 'agent-1', 'agent-1')")

    expect(sqlite.prepare('SELECT count(*) AS count FROM auth_users').get()).toEqual({ count: 0 })
    expect(sqlite.prepare('SELECT kind FROM users WHERE id = ?').get('agent-1')).toEqual({ kind: 'agent' })
    expect(sqlite.prepare('SELECT assignee_id FROM tasks WHERE id = ?').get('task-1')).toEqual({ assignee_id: 'agent-1' })
  })
})
