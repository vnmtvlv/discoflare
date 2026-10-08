import type { DatabaseSync, SQLInputValue } from 'node:sqlite'

/** Exercise the real Drizzle D1 adapter against SQLite, without remote services. */
export function authD1(sqlite: DatabaseSync): D1Database {
  const prepare = (sql: string, values: SQLInputValue[] = []) => ({
    bind: (...next: SQLInputValue[]) => prepare(sql, next),
    async first() { return sqlite.prepare(sql).get(...values) ?? null },
    async all() { return { success: true, results: sqlite.prepare(sql).all(...values) } },
    async run() { return { success: true, meta: sqlite.prepare(sql).run(...values) } },
    async raw() { return sqlite.prepare(sql).all(...values).map(row => Object.values(row)) },
  })
  return { prepare } as unknown as D1Database
}

export function cookies(response: Response): string {
  return response.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ')
}
