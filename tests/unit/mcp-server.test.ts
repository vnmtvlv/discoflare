import { createMcpHandler } from 'agents/mcp/server'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { version as packageVersion } from '../../package.json'
import { ALL_PERMISSIONS } from '../../shared/permissions'
import { INIT_SQL } from '../../server/utils/db'
import { createDiscoflareMcpServer } from '../../server/utils/mcp-server'
import type { DiscoflareEnv } from '../../workers/env'

let sqlite: DatabaseSync

function d1(database: DatabaseSync): D1Database {
  return {
    prepare(sql: string) {
      let values: SQLInputValue[] = []
      const statement = {
        bind(...next: SQLInputValue[]) { values = next; return statement },
        async first<T>() { return (database.prepare(sql).get(...values) as T | undefined) ?? null },
        async all<T>() { return { results: database.prepare(sql).all(...values) as T[] } },
        async run() { return { success: true, meta: database.prepare(sql).run(...values) } },
      }
      return statement
    },
  } as unknown as D1Database
}

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(INIT_SQL)
  sqlite.exec(`
    INSERT INTO roles (id, key, name, permissions_bitmask) VALUES ('owner-role', 'owner', 'Owner', 0);
    INSERT INTO identity_keys (id, name, email) VALUES ('owner', 'Owner', 'owner@example.com');
    INSERT INTO users (id, display_name, status, role_id, joined_at)
      VALUES ('owner', 'Owner', 'active', 'owner-role', '2026-09-06T00:00:00.000Z');
    INSERT INTO workspace (id, name, owner_id) VALUES ('main', 'Discoflare', 'owner');
  `)
})

afterEach(() => sqlite.close())

function createHandler() {
  return createMcpHandler(() => createDiscoflareMcpServer({
    env: { DB: d1(sqlite) } as DiscoflareEnv,
    principal: {
      tokenId: 'token',
      userId: 'owner',
      workspaceId: 'main',
      roleId: 'owner-role',
      roleName: 'Owner',
      perms: ALL_PERMISSIONS,
      isOwner: true,
      scopes: ['tasks:read', 'tasks:write', 'documents:read', 'documents:write'],
    },
    schedule: () => {},
  }), { allowedHostnames: ['localhost'], allowedOriginHostnames: ['localhost'] })
}

async function call(handler: ReturnType<typeof createHandler>, message: Record<string, unknown>) {
  const response = await handler.fetch(new Request('https://localhost/mcp', {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      Host: 'localhost',
    },
    body: JSON.stringify(message),
  }))
  const body = await response.text()
  const json = body.startsWith('event:') ? body.split('\ndata: ')[1]?.trim() : body
  return {
    response,
    payload: JSON.parse(json!) as { result: { tools?: Array<{ name: string }>; content?: Array<{ type: string; text: string }>; isError?: boolean } },
  }
}

describe('Discoflare MCP server', () => {
  it('reports the package version during MCP initialization', async () => {
    const { payload } = await call(createHandler(), {
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    })

    expect(payload.result.serverInfo).toEqual({ name: 'Discoflare', version: packageVersion })
  })

  it('publishes focused Tasks and Documents tools over Streamable HTTP', async () => {
    const { response, payload } = await call(createHandler(), { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })

    expect(response.status).toBe(200)
    expect(payload.result.tools?.map(tool => tool.name)).toEqual([
      'list_task_boards',
      'get_task',
      'create_task',
      'update_task',
      'list_documents',
      'get_document',
      'create_document',
      'update_document',
    ])
  })

  it('gets a task through MCP by its database-assigned number', async () => {
    sqlite.exec(`
      INSERT INTO task_boards (id, name, created_by) VALUES ('board-1', 'Roadmap', 'owner');
      INSERT INTO tasks (id, board_id, title, created_by) VALUES ('task-1', 'board-1', 'Ship native numbers', 'owner');
    `)

    const { response, payload } = await call(createHandler(), {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'get_task', arguments: { taskId: 1001 } },
    })
    const result = JSON.parse(payload.result.content?.[0]?.text ?? '{}') as { task?: { id: string; number: number; title: string } }

    expect(response.status).toBe(200)
    expect(payload.result.isError).not.toBe(true)
    expect(result.task).toMatchObject({ id: 'task-1', number: 1001, title: 'Ship native numbers' })
  })

  it('creates a workspace document through the MCP protocol and writes the normal audit entry', async () => {
    const { response, payload } = await call(createHandler(), {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'create_document',
        arguments: { title: 'Portal', content: '<p>Import Slack, Mattermost, and Discord.</p>' },
      },
    })

    expect(response.status).toBe(200)
    expect(payload.result.isError).not.toBe(true)
    expect(sqlite.prepare('SELECT title, content, created_by as createdBy FROM documents').get()).toEqual({
      title: 'Portal',
      content: '<p>Import Slack, Mattermost, and Discord.</p>',
      createdBy: 'owner',
    })
    expect(sqlite.prepare('SELECT action, target_type as targetType FROM audit_log').get()).toEqual({
      action: 'document.create',
      targetType: 'document',
    })
  })
})
