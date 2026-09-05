import { z } from 'zod'
import { nowIso, WORKSPACE_ID } from '../../../shared/ids'
import { Permission } from '../../../shared/permissions'
import type { DocumentDTO } from '../../../shared/types'
import { cf, fail } from '../../utils/cf'
import { requireDocument } from '../../utils/data-resources'
import { requireMember } from '../../utils/guards'
import { writeAudit } from '../../utils/messages'
import { parseBody } from '../../utils/validate'

const bodySchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  content: z.string().max(1_000_000).optional(),
  version: z.number().int().positive(),
}).refine(body => body.title !== undefined || body.content !== undefined, 'No changes')

export default defineEventHandler(async (event) => {
  const actor = await requireMember(event, WORKSPACE_ID, Permission.manageDatabases)
  const id = getRouterParam(event, 'id')!
  const body = parseBody(bodySchema, await readBody(event))
  const { env } = cf(event)
  const document = await requireDocument(env, id)
  if (document.version !== body.version) fail(409, 'stale_document', 'This document changed elsewhere. Reload and try again.')
  if (body.title !== undefined && await env.DB.prepare('SELECT id FROM documents WHERE id <> ? AND lower(title) = lower(?) LIMIT 1').bind(id, body.title).first()) {
    fail(409, 'duplicate_name', 'A document with this title already exists')
  }
  const assignments = ['updated_at = ?', 'version = version + 1']
  const values: string[] = [nowIso()]
  if (body.title !== undefined) { assignments.push('title = ?'); values.push(body.title) }
  if (body.content !== undefined) { assignments.push('content = ?'); values.push(body.content) }
  const updated = await env.DB.prepare(
    `UPDATE documents SET ${assignments.join(', ')} WHERE id = ? AND version = ?
     RETURNING id, title, content, position, version, created_by as createdBy,
     created_at as createdAt, updated_at as updatedAt`,
  ).bind(...values, id, body.version).first<DocumentDTO>()
  if (!updated) fail(409, 'stale_document', 'This document changed elsewhere. Reload and try again.')
  await writeAudit(env, { workspaceId: WORKSPACE_ID, actorId: actor.user.id, action: 'document.update', targetType: 'document', targetId: id, meta: { fields: Object.keys(body).filter(key => key !== 'version') } })
  return { document: updated }
})
