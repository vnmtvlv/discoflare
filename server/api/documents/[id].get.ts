import { WORKSPACE_ID } from '../../../shared/ids'
import { Permission } from '../../../shared/permissions'
import type { DocumentDTO } from '../../../shared/types'
import { cf } from '../../utils/cf'
import { requireDocument } from '../../utils/data-resources'
import { requireMember } from '../../utils/guards'

export default defineEventHandler(async (event): Promise<{ document: DocumentDTO }> => {
  await requireMember(event, WORKSPACE_ID, Permission.manageDatabases)
  const document = await requireDocument(cf(event).env, getRouterParam(event, 'id')!)
  return { document }
})
