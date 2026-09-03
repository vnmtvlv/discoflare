/// <reference types="@cloudflare/workers-types" />
import { drizzle } from 'drizzle-orm/d1'
import initSql from '../../drizzle/migrations/0000_init.sql?raw'
import { schema } from '../../drizzle/schema'

export function getDb(d1: D1Database) {
  return drizzle(d1, { schema })
}

/** Convert Drizzle's migration markers into the format accepted by D1 exec. */
export function d1ExecSql(sql: string): string {
  return sql
    .replaceAll('--> statement-breakpoint', '')
    .split(';')
    .map(statement => statement.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map(statement => `${statement};`)
    .join('\n')
}

export const INIT_SQL = d1ExecSql(initSql)

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
