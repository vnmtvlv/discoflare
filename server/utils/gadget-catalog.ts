import { hasPermission, Permission } from '../../shared/permissions'
import { emptyGadgetSpec, type GadgetDetailDTO, type GadgetListDTO, type GadgetSpec, type GadgetSummaryDTO } from '../../shared/gadgets'
import { newId, nowIso } from '../../shared/ids'
import type { DiscoflareEnv } from '../../workers/env'
import { fail } from './cf'
import type { Membership } from './guards'
import { parseGadgetSpec, validateGadgetSpec } from './gadget-spec'
import { writeAudit } from './messages'

export type GadgetRow = GadgetSummaryDTO & { draftSpecJson: string }

export function canManageGadgets(actor: Membership): boolean {
  return actor.isOwner || (hasPermission(actor.perms, Permission.manageGadgets) && hasPermission(actor.perms, Permission.manageDatabases))
}

export function canUseGadgets(actor: Membership): boolean {
  return canManageGadgets(actor)
    || hasPermission(actor.perms, Permission.useGadgets)
    || hasPermission(actor.perms, Permission.manageGadgets)
}

function summary(row: GadgetRow): GadgetSummaryDTO {
  const { draftSpecJson: _draftSpecJson, ...value } = row
  return value
}

function selectGadgetSql(where = ''): string {
  return `SELECT id, name, description, position, draft_spec_json as draftSpecJson,
    draft_revision as draftRevision, published_version as publishedVersion,
    created_by as createdBy, created_at as createdAt, updated_at as updatedAt
    FROM gadgets ${where}`
}

export async function requireGadget(env: DiscoflareEnv, id: string): Promise<GadgetRow> {
  const row = await env.DB.prepare(selectGadgetSql('WHERE id = ?')).bind(id).first<GadgetRow>()
  if (!row) fail(404, 'not_found', 'Gadget not found')
  return row
}

export async function listGadgets(env: DiscoflareEnv, actor: Membership): Promise<GadgetListDTO> {
  const canManage = canManageGadgets(actor)
  if (!canManage && !canUseGadgets(actor)) fail(403, 'forbidden', 'Missing permission')
  const result = canManage
    ? await env.DB.prepare(`${selectGadgetSql()} ORDER BY position, created_at`).all<GadgetRow>()
    : await env.DB.prepare(`${selectGadgetSql('WHERE published_version IS NOT NULL AND EXISTS (SELECT 1 FROM gadget_role_access access WHERE access.gadget_id = gadgets.id AND access.role_id = ?)')} ORDER BY position, created_at`).bind(actor.roleId).all<GadgetRow>()
  return { gadgets: (result.results ?? []).map(summary), canManage }
}

export async function getGadgetDetail(env: DiscoflareEnv, actor: Membership, id: string): Promise<GadgetDetailDTO> {
  if (!canManageGadgets(actor)) fail(403, 'forbidden', 'Missing permission')
  const row = await requireGadget(env, id)
  const access = await env.DB.prepare('SELECT role_id as roleId FROM gadget_role_access WHERE gadget_id = ? ORDER BY role_id').bind(id).all<{ roleId: string }>()
  let draftSpec: GadgetSpec
  try { draftSpec = parseGadgetSpec(JSON.parse(row.draftSpecJson)) }
  catch { fail(409, 'gadget_draft_invalid', 'The Gadget draft is invalid') }
  return { ...summary(row), draftSpec, roleIds: (access.results ?? []).map(item => item.roleId) }
}

async function validateRoleIds(env: DiscoflareEnv, roleIds: string[]): Promise<string[]> {
  const ids = [...new Set(roleIds)]
  if (!ids.length) return ids
  const placeholders = ids.map(() => '?').join(', ')
  const found = await env.DB.prepare(`SELECT id FROM roles WHERE id IN (${placeholders})`).bind(...ids).all<{ id: string }>()
  if ((found.results ?? []).length !== ids.length) fail(400, 'bad_request', 'A selected Role no longer exists')
  return ids
}

async function replaceRoleAccess(env: DiscoflareEnv, gadgetId: string, roleIds: string[]): Promise<void> {
  const statements = [env.DB.prepare('DELETE FROM gadget_role_access WHERE gadget_id = ?').bind(gadgetId)]
  for (const roleId of roleIds) statements.push(env.DB.prepare('INSERT INTO gadget_role_access (gadget_id, role_id) VALUES (?, ?)').bind(gadgetId, roleId))
  await env.DB.batch(statements)
}

export async function createGadget(
  env: DiscoflareEnv,
  actor: Membership,
  input: { name: string; description?: string; spec?: GadgetSpec; roleIds?: string[] },
): Promise<GadgetDetailDTO> {
  if (!canManageGadgets(actor)) fail(403, 'forbidden', 'Managing Gadgets also requires Manage data')
  const spec = await validateGadgetSpec(env, input.spec ?? emptyGadgetSpec())
  const roleIds = await validateRoleIds(env, input.roleIds ?? [])
  const duplicate = await env.DB.prepare('SELECT id FROM gadgets WHERE lower(name) = lower(?) LIMIT 1').bind(input.name).first()
  if (duplicate) fail(409, 'duplicate_name', 'A Gadget with this name already exists')
  const position = await env.DB.prepare('SELECT COALESCE(MAX(position), 0) + 1024 as value FROM gadgets').first<{ value: number }>()
  const id = newId()
  const now = nowIso()
  await env.DB.prepare(
    `INSERT INTO gadgets (id, name, description, draft_spec_json, draft_revision, position, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`,
  ).bind(id, input.name, input.description ?? '', JSON.stringify(spec), position?.value ?? 1024, actor.user.id, now, now).run()
  await replaceRoleAccess(env, id, roleIds)
  await writeAudit(env, { workspaceId: actor.workspaceId, actorId: actor.user.id, action: 'gadget.create', targetType: 'gadget', targetId: id, meta: { name: input.name }, authorization: actor.authorization })
  return { id, name: input.name, description: input.description ?? '', position: position?.value ?? 1024, draftRevision: 1, publishedVersion: null, createdBy: actor.user.id, createdAt: now, updatedAt: now, draftSpec: spec, roleIds }
}

export async function updateGadget(
  env: DiscoflareEnv,
  actor: Membership,
  id: string,
  input: { revision: number; name?: string; description?: string; spec?: GadgetSpec; roleIds?: string[] },
): Promise<GadgetDetailDTO> {
  if (!canManageGadgets(actor)) fail(403, 'forbidden', 'Managing Gadgets also requires Manage data')
  const current = await requireGadget(env, id)
  if (current.draftRevision !== input.revision) fail(409, 'stale_gadget', 'This Gadget changed elsewhere. Reload and try again.')
  if (input.name && await env.DB.prepare('SELECT id FROM gadgets WHERE id <> ? AND lower(name) = lower(?) LIMIT 1').bind(id, input.name).first()) {
    fail(409, 'duplicate_name', 'A Gadget with this name already exists')
  }
  const spec = input.spec ? await validateGadgetSpec(env, input.spec) : parseGadgetSpec(JSON.parse(current.draftSpecJson))
  const roleIds = input.roleIds ? await validateRoleIds(env, input.roleIds) : null
  const updated = await env.DB.prepare(
    `UPDATE gadgets SET name = ?, description = ?, draft_spec_json = ?, draft_revision = draft_revision + 1, updated_at = ?
     WHERE id = ? AND draft_revision = ?`,
  ).bind(input.name ?? current.name, input.description ?? current.description, JSON.stringify(spec), nowIso(), id, input.revision).run()
  if (!updated.meta.changes) fail(409, 'stale_gadget', 'This Gadget changed elsewhere. Reload and try again.')
  if (roleIds) await replaceRoleAccess(env, id, roleIds)
  await writeAudit(env, { workspaceId: actor.workspaceId, actorId: actor.user.id, action: 'gadget.update', targetType: 'gadget', targetId: id, meta: { fields: Object.keys(input).filter(key => key !== 'revision') }, authorization: actor.authorization })
  return getGadgetDetail(env, actor, id)
}

export async function publishGadget(env: DiscoflareEnv, actor: Membership, id: string, revision: number): Promise<GadgetDetailDTO> {
  if (!canManageGadgets(actor)) fail(403, 'forbidden', 'Managing Gadgets also requires Manage data')
  const current = await requireGadget(env, id)
  if (current.draftRevision !== revision) fail(409, 'stale_gadget', 'This Gadget changed elsewhere. Reload and try again.')
  const spec = await validateGadgetSpec(env, JSON.parse(current.draftSpecJson), { publish: true })
  const version = (current.publishedVersion ?? 0) + 1
  const now = nowIso()
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO gadget_versions (id, gadget_id, version, spec_json, created_by, created_at)
       SELECT ?, id, ?, ?, ?, ? FROM gadgets WHERE id = ? AND draft_revision = ?`,
    ).bind(newId(), version, JSON.stringify(spec), actor.user.id, now, id, revision),
    env.DB.prepare('UPDATE gadgets SET published_version = ?, updated_at = ? WHERE id = ? AND draft_revision = ?')
      .bind(version, now, id, revision),
  ])
  if (!results[0]?.meta.changes) fail(409, 'stale_gadget', 'This Gadget changed elsewhere. Reload and try again.')
  await writeAudit(env, { workspaceId: actor.workspaceId, actorId: actor.user.id, action: 'gadget.publish', targetType: 'gadget', targetId: id, meta: { version }, authorization: actor.authorization })
  return getGadgetDetail(env, actor, id)
}
