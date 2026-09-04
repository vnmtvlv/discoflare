import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signalAgentsForMessage } from '../../workers/agent-ingress'

let sqlite: DatabaseSync
let db: D1Database

function d1(database: DatabaseSync): D1Database {
  return {
    prepare(sql: string) {
      let values: unknown[] = []
      const statement = {
        bind(...next: unknown[]) {
          values = next
          return statement
        },
        async first<T>() {
          return (database.prepare(sql).get(...values) as T | undefined) ?? null
        },
        async all<T>() {
          return { results: database.prepare(sql).all(...values) as T[] }
        },
      }
      return statement
    },
  } as unknown as D1Database
}

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL);
    CREATE TABLE agents (user_id TEXT PRIMARY KEY, status TEXT NOT NULL);
    CREATE TABLE channels (id TEXT PRIMARY KEY, type TEXT NOT NULL, visibility TEXT NOT NULL, parent_id TEXT);
    CREATE TABLE channel_members (channel_id TEXT NOT NULL, user_id TEXT NOT NULL);

    INSERT INTO users VALUES
      ('human', 'human', 'active'),
      ('agent', 'agent', 'active');
    INSERT INTO agents VALUES ('agent', 'active');
    INSERT INTO channels VALUES
      ('dm', 'dm', 'private', NULL),
      ('thread', 'thread', 'private', 'dm');
    INSERT INTO channel_members VALUES
      ('dm', 'human'),
      ('dm', 'agent');
  `)
  db = d1(sqlite)
})

afterEach(() => sqlite.close())

describe('agent message ingress', () => {
  it('keeps addressing the agent inside a one-to-one DM thread', async () => {
    const receiveMessage = vi.fn(async () => 'workflow-id')
    const env = {
      DB: db,
      AGENT_DO: { getByName: () => ({ receiveMessage }) },
    }

    await signalAgentsForMessage(env as never, {
      messageId: 'message-thread',
      channelId: 'thread',
      authorName: 'Human',
      content: 'Continue here',
      mentionIds: [],
    })

    expect(receiveMessage).toHaveBeenCalledWith({
      messageId: 'message-thread',
      channelId: 'thread',
      authorName: 'Human',
      content: 'Continue here',
    })
  })
})
