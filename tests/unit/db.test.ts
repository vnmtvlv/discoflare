import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { d1ExecSql, INIT_SQL } from '../../server/utils/db'
import agentsAndTasksSql from '../../drizzle/migrations/0007_agents_and_tasks.sql?raw'
import agentTurnsSql from '../../drizzle/migrations/0008_agent_turns.sql?raw'
import taskManagementSql from '../../drizzle/migrations/0009_task_management.sql?raw'
import adminTaskBoundarySql from '../../drizzle/migrations/0011_admin_task_boundary.sql?raw'
import agentIdentityBoundarySql from '../../drizzle/migrations/0012_agent_identity_boundary.sql?raw'

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
    expect(INIT_SQL).toContain('CREATE TABLE `realtimekit_settings`')
    expect(INIT_SQL).toContain('CREATE TABLE `onboarding_revisions`')
    expect(INIT_SQL).toContain('CREATE TABLE `onboarding_acceptances`')
    expect(INIT_SQL).toContain('CREATE TABLE `email_domains`')
    expect(INIT_SQL).toContain('CREATE TABLE `email_mailboxes`')
    expect(INIT_SQL).toContain('CREATE TABLE `email_threads`')
    expect(INIT_SQL).toContain('CREATE TABLE `email_messages`')
    expect(INIT_SQL).toContain('CREATE TABLE `agents`')
    expect(INIT_SQL).toContain('CREATE TABLE `task_boards`')
    expect(INIT_SQL).toContain('CREATE TABLE `tasks`')
    expect(INIT_SQL).toContain('CREATE TABLE `task_runs`')
    expect(INIT_SQL).toContain('CREATE TABLE `task_labels`')
    expect(INIT_SQL).toContain('CREATE TABLE `task_label_links`')
    expect(INIT_SQL).toContain('CREATE TABLE `task_dependencies`')
    expect(INIT_SQL).toContain('CREATE TABLE `task_checklist_items`')
    expect(INIT_SQL).toContain('CREATE TABLE `task_attachments`')
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

  it('models an agent as a participant without credentials or a browser session', () => {
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(INIT_SQL)
    sqlite.exec("INSERT INTO roles (id, key, name, permissions_bitmask) VALUES ('member-role', 'member', 'member', 112)")
    sqlite.exec("INSERT INTO identity_keys (id, name, email) VALUES ('agent-1', 'Builder', 'agent+agent-1@discoflare.invalid')")
    sqlite.exec("INSERT INTO users (id, kind, display_name, status, role_id, joined_at) VALUES ('agent-1', 'agent', 'Builder', 'active', 'member-role', '2026-09-04T00:00:00.000Z')")
    sqlite.exec("INSERT INTO agents (user_id, sandbox_id, created_by) VALUES ('agent-1', 'agent-agent-1', 'agent-1')")
    sqlite.exec("INSERT INTO task_boards (id, name, created_by) VALUES ('board-1', 'Launch', 'agent-1')")
    sqlite.exec("INSERT INTO tasks (id, board_id, title, assignee_id, created_by) VALUES ('task-1', 'board-1', 'Ship it', 'agent-1', 'agent-1')")
    sqlite.exec("INSERT INTO task_runs (id, task_id, agent_id, status, progress, created_at) VALUES ('run-1', 'task-1', 'agent-1', 'running', 'Thinking', '2026-09-04T00:00:00.000Z')")
    sqlite.exec("INSERT INTO task_labels (id, board_id, name, created_by) VALUES ('label-1', 'board-1', 'urgent', 'agent-1')")
    sqlite.exec("INSERT INTO task_label_links (task_id, label_id) VALUES ('task-1', 'label-1')")
    sqlite.exec("INSERT INTO task_checklist_items (id, task_id, title, created_by) VALUES ('item-1', 'task-1', 'Verify', 'agent-1')")

    expect(sqlite.prepare('SELECT count(*) AS count FROM auth_accounts').get()).toEqual({ count: 0 })
    expect(sqlite.prepare('SELECT count(*) AS count FROM auth_sessions').get()).toEqual({ count: 0 })
    expect(sqlite.prepare('SELECT count(*) AS count FROM auth_users').get()).toEqual({ count: 0 })
    expect(sqlite.prepare('SELECT kind FROM users WHERE id = ?').get('agent-1')).toEqual({ kind: 'agent' })
    expect(sqlite.prepare('SELECT assignee_id FROM tasks WHERE id = ?').get('task-1')).toEqual({ assignee_id: 'agent-1' })
    expect(sqlite.prepare('SELECT priority, active_run_id FROM tasks WHERE id = ?').get('task-1')).toEqual({ priority: 'normal', active_run_id: null })
    expect(sqlite.prepare('SELECT status, progress, task_status_before FROM task_runs WHERE id = ?').get('run-1')).toEqual({ status: 'running', progress: 'Thinking', task_status_before: 'ready' })
  })

  it('adds participant kind without replacing a referenced users table', () => {
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE auth_users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        email_verified INTEGER NOT NULL DEFAULT 0,
        image TEXT,
        created_at INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE UNIQUE INDEX auth_users_email_unique ON auth_users(email);
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        handle TEXT,
        display_name TEXT NOT NULL,
        avatar_r2_key TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        role_id TEXT,
        nickname TEXT,
        joined_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (id) REFERENCES auth_users(id) ON DELETE CASCADE
      );
      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL REFERENCES users(id)
      );
      CREATE TABLE roles (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        name TEXT NOT NULL,
        permissions_bitmask INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE channels (id TEXT PRIMARY KEY);
      INSERT INTO auth_users (id, name, email) VALUES ('human-1', 'Alice', 'alice@example.com');
      INSERT INTO users (id, display_name) VALUES ('human-1', 'Alice');
      INSERT INTO messages VALUES ('message-1', 'human-1');
    `)

    sqlite.exec(d1ExecSql(agentsAndTasksSql))

    expect(sqlite.prepare('SELECT kind FROM users WHERE id = ?').get('human-1')).toEqual({ kind: 'human' })
    expect(sqlite.prepare('SELECT author_id FROM messages WHERE id = ?').get('message-1')).toEqual({ author_id: 'human-1' })
    sqlite.close()
  })

  it('upgrades existing task runs without losing their history', () => {
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE auth_users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        email_verified INTEGER NOT NULL DEFAULT 0,
        image TEXT,
        created_at INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE UNIQUE INDEX auth_users_email_unique ON auth_users(email);
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        handle TEXT,
        display_name TEXT NOT NULL,
        avatar_r2_key TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        role_id TEXT,
        nickname TEXT,
        joined_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (id) REFERENCES auth_users(id) ON DELETE CASCADE
      );
      CREATE TABLE messages (id TEXT PRIMARY KEY, author_id TEXT NOT NULL REFERENCES users(id));
      CREATE TABLE roles (id TEXT PRIMARY KEY, key TEXT NOT NULL, name TEXT NOT NULL, permissions_bitmask INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE channels (id TEXT PRIMARY KEY);
      INSERT INTO roles VALUES ('member-role', 'member', 'Member', 112);
      INSERT INTO roles VALUES ('admin-role', 'admin', 'Admin', 255);
      INSERT INTO roles VALUES ('custom-role', 'custom:ops', 'Ops', 112);
      INSERT INTO auth_users (id, name, email) VALUES ('agent-1', 'Builder', 'agent+agent-1@discoflare.invalid');
      INSERT INTO users (id, display_name, status, role_id, joined_at) VALUES ('agent-1', 'Builder', 'active', 'member-role', '2026-09-04T00:00:00.000Z');
    `)
    sqlite.exec(d1ExecSql(agentsAndTasksSql))
    sqlite.exec(d1ExecSql(agentTurnsSql))
    sqlite.exec(`
      INSERT INTO agents (user_id, sandbox_id, created_by) VALUES ('agent-1', 'agent-agent-1', 'agent-1');
      INSERT INTO task_boards (id, name, created_by) VALUES ('board-1', 'Launch', 'agent-1');
      INSERT INTO tasks (id, board_id, title, description, status, assignee_id, created_by)
        VALUES ('task-1', 'board-1', 'Ship it', 'Carefully', 'review', 'agent-1', 'agent-1');
      INSERT INTO task_runs (id, task_id, agent_id, status, summary, progress, created_at)
        VALUES ('run-1', 'task-1', 'agent-1', 'completed', 'Shipped', 'Finishing', '2026-09-04T00:00:00.000Z');
    `)

    sqlite.exec(d1ExecSql(taskManagementSql))
    sqlite.exec(d1ExecSql(adminTaskBoundarySql))
    sqlite.exec(d1ExecSql(agentIdentityBoundarySql))

    expect(sqlite.prepare('SELECT status, summary, progress, title_snapshot, description_snapshot, task_status_before FROM task_runs WHERE id = ?').get('run-1')).toEqual({
      status: 'completed',
      summary: 'Shipped',
      progress: 'Finishing',
      title_snapshot: 'Ship it',
      description_snapshot: 'Carefully',
      task_status_before: 'review',
    })
    expect(sqlite.prepare('SELECT permissions_bitmask FROM roles WHERE id = ?').get('member-role')).toEqual({ permissions_bitmask: 112 })
    expect(sqlite.prepare('SELECT permissions_bitmask FROM roles WHERE id = ?').get('admin-role')).toEqual({ permissions_bitmask: 511 })
    expect(sqlite.prepare('SELECT permissions_bitmask FROM roles WHERE id = ?').get('custom-role')).toEqual({ permissions_bitmask: 112 })
    expect(sqlite.prepare('SELECT count(*) AS count FROM auth_users WHERE id = ?').get('agent-1')).toEqual({ count: 0 })
    sqlite.exec("INSERT INTO identity_keys (id, name, email) VALUES ('agent-2', 'Reviewer', 'agent+agent-2@discoflare.invalid')")
    expect(() => sqlite.exec("INSERT INTO users (id, kind, display_name, status, role_id, joined_at) VALUES ('agent-2', 'agent', 'Reviewer', 'active', 'member-role', '2026-09-04T00:00:00.000Z')")).not.toThrow()
    sqlite.close()
  })
})
