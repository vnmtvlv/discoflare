import { adminEnv, assertMutation, progressStream } from '../utils/http'
import { requireOwner } from '../utils/session'
import { createWorkspace } from '../utils/workspaces'

/** Create a workspace linked to this Admin. Progress streams as NDJSON. */
export default defineEventHandler(async (event) => {
  assertMutation(event)
  const owner = await requireOwner(event)
  const body = await readBody<{ workerName?: unknown, appName?: unknown }>(event) ?? {}
  const env = adminEnv(event)
  return progressStream(event, report => createWorkspace(env, { ...body, ownerEmail: owner.email }, report))
})
