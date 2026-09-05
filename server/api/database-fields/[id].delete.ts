import { WORKSPACE_ID } from '../../../shared/ids'
import { Permission } from '../../../shared/permissions'
import { cf } from '../../utils/cf'
import { requireDatabase, requireDatabaseField } from '../../utils/database-data'
import { requireMember } from '../../utils/guards'
import { writeAudit } from '../../utils/messages'

export default defineEventHandler(async (event) => {
  const actor = await requireMember(event, WORKSPACE_ID, Permission.manageDatabases)
  const id = getRouterParam(event, 'id')!
  const { env } = cf(event)
  const field = await requireDatabaseField(env, id)
  await requireDatabase(env, field.databaseId, true)
  await env.DB.batch([
    env.DB.prepare(`UPDATE database_items SET ${field.slot} = NULL, version = version + 1, updated_at = ? WHERE database_id = ?`).bind(new Date().toISOString(), field.databaseId),
    env.DB.prepare('DELETE FROM database_fields WHERE id = ?').bind(id),
  ])
  await writeAudit(env, { workspaceId: WORKSPACE_ID, actorId: actor.user.id, action: 'database_field.delete', targetType: 'database_field', targetId: id, meta: { databaseId: field.databaseId, name: field.name, type: field.type } })
  return { ok: true }
})
