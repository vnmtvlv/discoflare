/// <reference types="@cloudflare/workers-types" />
import { drizzle } from 'drizzle-orm/d1'
import initSql from '../../drizzle/migrations/0000_init.sql?raw'
import categorySql from '../../drizzle/migrations/0001_channel_categories.sql?raw'
import authSettingsSql from '../../drizzle/migrations/0002_auth_settings.sql?raw'
import messageSearchSql from '../../drizzle/migrations/0003_message_search.sql?raw'
import pushNotificationsSql from '../../drizzle/migrations/0004_push_notifications.sql?raw'
import messagePinsSql from '../../drizzle/migrations/0005_message_pins.sql?raw'
import channelRoleOverridesSql from '../../drizzle/migrations/0006_channel_role_overrides.sql?raw'
import agentsAndTasksSql from '../../drizzle/migrations/0007_agents_and_tasks.sql?raw'
import agentTurnsSql from '../../drizzle/migrations/0008_agent_turns.sql?raw'
import taskManagementSql from '../../drizzle/migrations/0009_task_management.sql?raw'
import realtimekitSettingsSql from '../../drizzle/migrations/0010_realtimekit_settings.sql?raw'
import adminTaskBoundarySql from '../../drizzle/migrations/0011_admin_task_boundary.sql?raw'
import agentIdentityBoundarySql from '../../drizzle/migrations/0012_agent_identity_boundary.sql?raw'
import onboardingSql from '../../drizzle/migrations/0013_onboarding.sql?raw'
import workspaceMailSql from '../../drizzle/migrations/0014_workspace_mail.sql?raw'
import { schema } from '../../drizzle/schema'

export function getDb(d1: D1Database) {
  return drizzle(d1, { schema })
}

/** Convert Drizzle's migration markers into the format accepted by D1 exec. */
export function d1ExecSql(sql: string): string {
  return sql
    .split('--> statement-breakpoint')
    .map(statement => statement
      .split('\n')
      .filter(line => !line.trimStart().startsWith('--'))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean)
    .map(statement => statement.endsWith(';') ? statement : `${statement};`)
    .join('\n')
}

export const INIT_SQL = d1ExecSql([
  initSql,
  categorySql,
  authSettingsSql,
  messageSearchSql,
  pushNotificationsSql,
  messagePinsSql,
  channelRoleOverridesSql,
  agentsAndTasksSql,
  agentTurnsSql,
  taskManagementSql,
  realtimekitSettingsSql,
  adminTaskBoundarySql,
  agentIdentityBoundarySql,
  onboardingSql,
  workspaceMailSql,
].join('\n--> statement-breakpoint\n'))

/** Bootstrap is only for an empty, pre-v0.1 database. Deployed changes use D1 migrations. */
export async function ensureMigrated(db: D1Database): Promise<boolean> {
  try {
    await db.prepare('SELECT id FROM workspace LIMIT 1').first()
  }
  catch {
    await db.exec(INIT_SQL)
  }
  await db.prepare('SELECT kind FROM users LIMIT 1').first()
  await db.prepare('SELECT user_id FROM agents LIMIT 1').first()
  return true
}

export async function userCount(db: D1Database): Promise<number> {
  try {
    const row = await db.prepare("SELECT COUNT(*) as c FROM users WHERE status = 'active'").first<{ c: number }>()
    return row?.c ?? 0
  }
  catch {
    return 0
  }
}

export async function workspaceReady(db: D1Database): Promise<boolean> {
  try {
    return Boolean(await db.prepare("SELECT id FROM workspace WHERE id = 'main'").first())
  }
  catch {
    return false
  }
}
