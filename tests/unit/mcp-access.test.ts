import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { INIT_SQL } from '../../server/utils/db'
import { authenticateMcpRequest, issueMcpAccessToken, revokeMcpAccessToken } from '../../server/utils/mcp-access'
import type { DiscoflareEnv } from '../../workers/env'

let sqlite: DatabaseSync
let env: DiscoflareEnv

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
    INSERT INTO identity_keys (id, name, email) VALUES ('owner-user', 'Owner', 'owner@example.com');
    INSERT INTO users (id, display_name, status, role_id, joined_at)
      VALUES ('owner-user', 'Owner', 'active', 'owner-role', '2026-09-06T00:00:00.000Z');
    INSERT INTO workspace (id, name, owner_id) VALUES ('main', 'Discoflare', 'owner-user');
  `)
  env = { DB: d1(sqlite) } as DiscoflareEnv
})

afterEach(() => sqlite.close())

describe('MCP access tokens', () => {
  it('stores only a digest and authenticates the issuing member with current workspace access', async () => {
    const issued = await issueMcpAccessToken(env, 'owner-user', 'Codex')
    const stored = sqlite.prepare('SELECT token_hash as tokenHash, token_prefix as tokenPrefix FROM mcp_access_tokens WHERE id = ?').get(issued.id) as { tokenHash: string; tokenPrefix: string }

    expect(issued.token).toMatch(/^dfmcp_[0-9a-f]{64}$/u)
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/u)
    expect(stored.tokenHash).not.toBe(issued.token)
    expect(stored.tokenPrefix).toBe(issued.tokenPrefix)

    const principal = await authenticateMcpRequest(env, new Request('https://workspace.example/mcp', {
      headers: { Authorization: `Bearer ${issued.token}` },
    }))

    expect(principal).toMatchObject({ userId: 'owner-user', workspaceId: 'main', isOwner: true })
    expect(principal?.scopes).toEqual(['tasks:read', 'tasks:write', 'documents:read', 'documents:write'])
    expect(sqlite.prepare('SELECT last_used_at as lastUsedAt FROM mcp_access_tokens WHERE id = ?').get(issued.id)).toMatchObject({ lastUsedAt: expect.any(String) })
  })

  it('rejects malformed and revoked credentials', async () => {
    const issued = await issueMcpAccessToken(env, 'owner-user', 'Codex')

    await expect(authenticateMcpRequest(env, new Request('https://workspace.example/mcp'))).resolves.toBeNull()
    expect(await revokeMcpAccessToken(env, issued.id)).toBe(true)
    await expect(authenticateMcpRequest(env, new Request('https://workspace.example/mcp', {
      headers: { Authorization: `Bearer ${issued.token}` },
    }))).resolves.toBeNull()
  })

  it('stops authenticating when the issuing member is removed', async () => {
    const issued = await issueMcpAccessToken(env, 'owner-user', 'Codex')
    sqlite.exec("UPDATE users SET status = 'removed', role_id = NULL, joined_at = NULL WHERE id = 'owner-user'")

    await expect(authenticateMcpRequest(env, new Request('https://workspace.example/mcp', {
      headers: { Authorization: `Bearer ${issued.token}` },
    }))).resolves.toBeNull()
  })
})
