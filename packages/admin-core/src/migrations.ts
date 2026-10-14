import { installerError } from './errors.js'
import type { InstallerReleaseManifest } from './types.js'

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

/** Pending D1 migrations as one statement batch, or null when the database is current. */
export function pendingMigrationBatch(
  migrations: Array<{ name: string, sql: string }>,
  appliedNames: Iterable<string>,
) {
  const names = new Set<string>()
  for (const migration of migrations) {
    if (!/^[0-9A-Za-z_.-]+$/.test(migration.name)) {
      installerError(502, `Discoflare migration ${migration.name} has an invalid name`)
    }
    if (names.has(migration.name)) installerError(502, `Discoflare migration ${migration.name} is duplicated`)
    names.add(migration.name)
  }
  const applied = new Set(appliedNames)
  const pending = migrations.filter(migration => !applied.has(migration.name))
  if (!pending.length) return null
  return {
    names: pending.map(migration => migration.name),
    sql: pending
      .map(migration => `${migration.sql.replaceAll('--> statement-breakpoint', '\n')}\nINSERT INTO d1_migrations (name) VALUES (${sqlString(migration.name)});`)
      .join('\n'),
  }
}

export type ExistingWorkerMigration = { exists: boolean, migrationTag?: string }

export function durableObjectMigrations(manifest: Pick<InstallerReleaseManifest, 'durableObjects'>, worker: ExistingWorkerMigration) {
  const groups = new Map<string, string[]>()
  for (const item of manifest.durableObjects) groups.set(item.migration, [...groups.get(item.migration) || [], item.className])
  const steps = [...groups.entries()]
  const latestTag = steps.at(-1)?.[0]
  if (!latestTag) installerError(502, 'Discoflare release has no Durable Object migrations')
  if (!worker.exists) return { new_tag: latestTag, steps: steps.map(([, new_sqlite_classes]) => ({ new_sqlite_classes })) }
  if (!worker.migrationTag) installerError(409, 'Existing Discoflare Worker has no migration tag')
  const currentIndex = steps.findIndex(([tag]) => tag === worker.migrationTag)
  if (currentIndex === -1) installerError(409, `Existing Discoflare migration ${worker.migrationTag} is not recognized`)
  const pending = steps.slice(currentIndex + 1)
  if (!pending.length) return undefined
  return {
    old_tag: worker.migrationTag,
    new_tag: latestTag,
    steps: pending.map(([, new_sqlite_classes]) => ({ new_sqlite_classes })),
  }
}
