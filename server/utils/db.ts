/// <reference types="@cloudflare/workers-types" />
import { drizzle } from 'drizzle-orm/d1'
import { schema } from '../../drizzle/schema'

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- Nuxt's Vite transform provides import.meta.glob at build time.
const migrationModules = import.meta.glob<string>('../../drizzle/migrations/*.sql', {
  eager: true,
  import: 'default',
  query: '?raw',
})

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

export const INIT_SQL = d1ExecSql(Object.entries(migrationModules)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([, sql]) => sql)
  .join('\n--> statement-breakpoint\n'))

/** Bootstrap is only for an empty, pre-v0.1 database. Deployed changes use D1 migrations. */
// An isolate serves one installation, so a schema that was present once stays
// present for the isolate's lifetime. Skipping the probes saves three D1 round
// trips on every public request.
let migratedInIsolate = false

export async function ensureMigrated(db: D1Database): Promise<boolean> {
  if (migratedInIsolate) return true
  try {
    await db.prepare('SELECT id FROM workspace LIMIT 1').first()
  }
  catch {
    await db.exec(INIT_SQL)
  }
  await Promise.all([
    db.prepare('SELECT kind FROM users LIMIT 1').first(),
    db.prepare('SELECT user_id FROM agents LIMIT 1').first(),
  ])
  migratedInIsolate = true
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
