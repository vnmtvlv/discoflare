import { z } from 'zod'
import type { DatabasePageDTO } from '../../../shared/types'
import { WORKSPACE_ID } from '../../../shared/ids'
import { Permission } from '../../../shared/permissions'
import { cf, fail } from '../../utils/cf'
import { loadDatabasePage } from '../../utils/database-views'
import { requireMember } from '../../utils/guards'

const querySchema = z.object({
  view: z.string().min(1).optional(),
  search: z.string().max(500).default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(100),
})

export default defineEventHandler(async (event): Promise<DatabasePageDTO> => {
  await requireMember(event, WORKSPACE_ID, Permission.manageDatabases)
  const parsed = querySchema.safeParse(getQuery(event))
  if (!parsed.success) fail(400, 'bad_request', parsed.error.issues[0]?.message ?? 'Invalid database query')
  const query = parsed.data
  return loadDatabasePage(cf(event).env, getRouterParam(event, 'id')!, {
    viewId: query.view,
    search: query.search,
    page: query.page,
    pageSize: query.pageSize,
  })
})
