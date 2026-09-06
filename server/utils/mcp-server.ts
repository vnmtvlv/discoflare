import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { WORKSPACE_ID } from '../../shared/ids'
import { Permission } from '../../shared/permissions'
import type { DiscoflareEnv } from '../../workers/env'
import { loadDataResources, requireDocument } from './data-resources'
import { createDocument, updateDocument } from './document-service'
import { requireMcpAccess, type McpPrincipal } from './mcp-access'
import { loadTaskBoards, loadTaskDetail } from './task-data'
import { createTask, updateTask } from './task-service'

type McpServerContext = {
  env: DiscoflareEnv
  principal: McpPrincipal
  schedule: (promise: Promise<unknown>) => void
}

function result(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
}

const dueAtSchema = z.string().refine(value => !Number.isNaN(Date.parse(value)), 'Invalid due date').nullable()
const prioritySchema = z.enum(['low', 'normal', 'high', 'urgent'])
const statusSchema = z.enum(['backlog', 'ready', 'review', 'done', 'failed'])

export function createDiscoflareMcpServer({ env, principal, schedule }: McpServerContext): McpServer {
  const server = new McpServer({ name: 'Discoflare', version: '0.2.3' })

  server.registerTool('list_task_boards', {
    description: 'List task boards with their tasks, labels, dependencies, checklist counts, and latest run status.',
    inputSchema: { includeArchived: z.boolean().default(false) },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ includeArchived }) => {
    requireMcpAccess(principal, 'tasks:read', Permission.manageTasks)
    return result({ boards: await loadTaskBoards(env, includeArchived) })
  })

  server.registerTool('get_task', {
    description: 'Get one task with its labels, dependencies, checklist, attachments, and run history.',
    inputSchema: { taskId: z.string().min(8) },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ taskId }) => {
    requireMcpAccess(principal, 'tasks:read', Permission.manageTasks)
    const task = await loadTaskDetail(env, taskId)
    if (!task) throw new Error('Task not found')
    return result({ task })
  })

  server.registerTool('create_task', {
    description: 'Create a task on a Discoflare task board. Unassigned tasks start in backlog; assigned tasks start ready.',
    inputSchema: {
      boardId: z.string().min(8),
      title: z.string().trim().min(1).max(160),
      description: z.string().trim().max(12_000).default(''),
      priority: prioritySchema.default('normal'),
      dueAt: dueAtSchema.default(null),
      assigneeId: z.string().min(8).nullable().default(null),
      channelId: z.string().min(8).nullable().default(null),
      labelIds: z.array(z.string().min(8)).max(20).default([]),
      dependencyIds: z.array(z.string().min(8)).max(100).default([]),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ boardId, ...input }) => {
    requireMcpAccess(principal, 'tasks:write', Permission.manageTasks)
    return result({ task: await createTask(env, principal.userId, boardId, input, schedule) })
  })

  server.registerTool('update_task', {
    description: 'Update, move, archive, or restore a task. A running task must be cancelled before it can be changed.',
    inputSchema: {
      taskId: z.string().min(8),
      title: z.string().trim().min(1).max(160).optional(),
      description: z.string().trim().max(12_000).optional(),
      status: statusSchema.optional(),
      priority: prioritySchema.optional(),
      dueAt: dueAtSchema.optional(),
      position: z.number().int().min(0).optional(),
      boardId: z.string().min(8).optional(),
      assigneeId: z.string().min(8).nullable().optional(),
      channelId: z.string().min(8).nullable().optional(),
      archived: z.boolean().optional(),
      labelIds: z.array(z.string().min(8)).max(20).optional(),
      dependencyIds: z.array(z.string().min(8)).max(100).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ taskId, ...input }) => {
    requireMcpAccess(principal, 'tasks:write', Permission.manageTasks)
    if (!Object.keys(input).length) throw new Error('No changes supplied')
    return result({ task: await updateTask(env, principal.userId, taskId, input, schedule) })
  })

  server.registerTool('list_documents', {
    description: 'List Discoflare document summaries. Use get_document to read a document body.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => {
    requireMcpAccess(principal, 'documents:read', Permission.manageDatabases)
    const resources = await loadDataResources(env)
    return result({ documents: resources.documents })
  })

  server.registerTool('get_document', {
    description: 'Read one Discoflare document. The content field contains HTML used by the rich-text editor.',
    inputSchema: { documentId: z.string().min(8) },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ documentId }) => {
    requireMcpAccess(principal, 'documents:read', Permission.manageDatabases)
    return result({ document: await requireDocument(env, documentId) })
  })

  server.registerTool('create_document', {
    description: 'Create a Discoflare document. Supply the rich-text body as HTML.',
    inputSchema: {
      title: z.string().trim().min(1).max(160),
      content: z.string().max(1_000_000).default(''),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (input) => {
    requireMcpAccess(principal, 'documents:write', Permission.manageDatabases)
    return result({ document: await createDocument(env, WORKSPACE_ID, principal.userId, input) })
  })

  server.registerTool('update_document', {
    description: 'Update a Discoflare document using its current version. Supply rich-text content as HTML.',
    inputSchema: {
      documentId: z.string().min(8),
      title: z.string().trim().min(1).max(160).optional(),
      content: z.string().max(1_000_000).optional(),
      version: z.number().int().positive(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ documentId, ...input }) => {
    requireMcpAccess(principal, 'documents:write', Permission.manageDatabases)
    if (input.title === undefined && input.content === undefined) throw new Error('No changes supplied')
    return result({ document: await updateDocument(env, WORKSPACE_ID, principal.userId, documentId, input) })
  })

  return server
}
