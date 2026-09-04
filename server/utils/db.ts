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
].join('\n--> statement-breakpoint\n'))

/** Bootstrap is only for an empty, pre-v0.1 database. Deployed changes use D1 migrations. */
export async function ensureMigrated(db: D1Database): Promise<boolean> {
  try {
    await db.prepare('SELECT id FROM workspace LIMIT 1').first()
  }
  catch {
    await db.exec(INIT_SQL)
  }
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
