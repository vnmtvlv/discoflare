import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/vue-query'
import { applyWorkspaceRealtimeEvent } from '../../app/utils/workspace-realtime'
import { channelActivityAudience, signalChannelActivity } from '../../workers/channel-activity'
import { sendWorkspaceEvent } from '../../workers/workspace-events'

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
        async run() {
          database.prepare(sql).run(...values)
          return { success: true }
        },
      }
      return statement
    },
  } as unknown as D1Database
}

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, status TEXT NOT NULL);
    CREATE TABLE channels (id TEXT PRIMARY KEY, type TEXT NOT NULL, visibility TEXT NOT NULL, parent_id TEXT);
    CREATE TABLE channel_members (channel_id TEXT NOT NULL, user_id TEXT NOT NULL, hidden_at TEXT);
    INSERT INTO users VALUES
      ('author', 'active'),
      ('member-a', 'active'),
      ('member-b', 'active'),
      ('outsider', 'active'),
      ('removed', 'removed');
  `)
  db = d1(sqlite)
})

afterEach(() => sqlite.close())

describe('channel activity audience', () => {
  it('targets every other active member for a workspace channel', async () => {
    sqlite.exec(`INSERT INTO channels VALUES ('general', 'text', 'workspace', NULL);`)

    await expect(channelActivityAudience(db, 'general', 'author')).resolves.toEqual({
      sourceChannelId: 'general',
      rootChannelId: 'general',
      rootType: 'text',
      recipientIds: ['member-a', 'member-b', 'outsider'],
    })
  })

  it('does not leak private-channel activity to non-members', async () => {
    sqlite.exec(`
      INSERT INTO channels VALUES ('private', 'text', 'private', NULL);
      INSERT INTO channel_members (channel_id, user_id) VALUES
        ('private', 'author'),
        ('private', 'member-a'),
        ('private', 'removed');
    `)

    await expect(channelActivityAudience(db, 'private', 'author')).resolves.toEqual({
      sourceChannelId: 'private',
      rootChannelId: 'private',
      rootType: 'text',
      recipientIds: ['member-a'],
    })
  })

  it('maps a DM thread to its parent and only targets active DM participants', async () => {
    sqlite.exec(`
      INSERT INTO channels VALUES
        ('dm', 'dm', 'private', NULL),
        ('thread', 'thread', 'private', 'dm');
      INSERT INTO channel_members (channel_id, user_id) VALUES
        ('dm', 'author'),
        ('dm', 'member-b'),
        ('dm', 'removed');
    `)

    await expect(channelActivityAudience(db, 'thread', 'author')).resolves.toEqual({
      sourceChannelId: 'thread',
      rootChannelId: 'dm',
      rootType: 'dm',
      recipientIds: ['member-b'],
    })
  })

  it('unhides a DM root before publishing thread activity', async () => {
    sqlite.exec(`
      INSERT INTO channels VALUES
        ('dm', 'dm', 'private', NULL),
        ('thread', 'thread', 'private', 'dm');
      INSERT INTO channel_members VALUES
        ('dm', 'author', NULL),
        ('dm', 'member-b', '2026-09-04T00:00:00Z');
    `)
    const notifyChannelActivity = vi.fn(async () => {
      expect(sqlite.prepare(
        'SELECT hidden_at FROM channel_members WHERE channel_id = ? AND user_id = ?',
      ).get('dm', 'member-b')).toEqual({ hidden_at: null })
    })
    const env = {
      DB: db,
      WORKSPACE_DO: { getByName: () => ({ notifyChannelActivity }) },
    }

    await signalChannelActivity(env as never, 'thread', 'author', 'message-1')

    expect(notifyChannelActivity).toHaveBeenCalledWith({
      t: 'channel.activity',
      sourceChannelId: 'thread',
      rootChannelId: 'dm',
      messageId: 'message-1',
    }, ['member-b'])
  })
})

describe('workspace event delivery', () => {
  it('delivers to every tab of a recipient and no other socket', () => {
    const allowedA = vi.fn()
    const allowedB = vi.fn()
    const outsider = vi.fn()
    const sockets = [
      { deserializeAttachment: () => ({ userId: 'member-a', lastActive: 1 }), send: allowedA },
      { deserializeAttachment: () => ({ userId: 'member-a', lastActive: 2 }), send: allowedB },
      { deserializeAttachment: () => ({ userId: 'outsider', lastActive: 2 }), send: outsider },
      { deserializeAttachment: () => null, send: vi.fn() },
    ]
    const event = {
      t: 'channel.activity' as const,
      sourceChannelId: 'thread',
      rootChannelId: 'private',
      messageId: '01990000-0000-7000-8000-000000000001',
    }

    sendWorkspaceEvent(sockets, new Set(['member-a']), event)

    expect(allowedA).toHaveBeenCalledWith(JSON.stringify(event))
    expect(allowedB).toHaveBeenCalledWith(JSON.stringify(event))
    expect(outsider).not.toHaveBeenCalled()
  })
})

describe('workspace unread cache events', () => {
  it('marks the root channel unread for newer thread activity', () => {
    const cache = new QueryClient()
    cache.setQueryData(['channels', 'main'], { channels: [{ id: 'parent', unread: false }] })

    applyWorkspaceRealtimeEvent(cache, {
      t: 'channel.activity',
      sourceChannelId: 'thread',
      rootChannelId: 'parent',
      messageId: '01990000-0000-7000-8000-000000000002',
    })

    expect(cache.getQueryData(['channels', 'main'])).toEqual({ channels: [{ id: 'parent', unread: true }] })
  })

  it('ignores activity at or behind a cursor already read in another delivery order', () => {
    const cache = new QueryClient()
    cache.setQueryData(['dms'], { channels: [{ id: 'dm', unread: false }] })
    cache.setQueryData(['readCursor', 'thread'], '01990000-0000-7000-8000-000000000002')

    applyWorkspaceRealtimeEvent(cache, {
      t: 'channel.activity',
      sourceChannelId: 'thread',
      rootChannelId: 'dm',
      messageId: '01990000-0000-7000-8000-000000000002',
    })

    expect(cache.getQueryData(['dms'])).toEqual({ channels: [{ id: 'dm', unread: false }] })
  })

  it('applies a remote-tab read to every cached parent list', () => {
    const cache = new QueryClient()
    cache.setQueryData(['channels', 'main'], { channels: [{ id: 'parent', unread: true }] })
    cache.setQueryData(['dms'], { channels: [{ id: 'parent', unread: true }] })

    applyWorkspaceRealtimeEvent(cache, {
      t: 'channel.read',
      sourceChannelId: 'thread',
      rootChannelId: 'parent',
      messageId: '01990000-0000-7000-8000-000000000003',
      unread: false,
    })

    expect(cache.getQueryData(['readCursor', 'thread'])).toBe('01990000-0000-7000-8000-000000000003')
    expect(cache.getQueryData(['channels', 'main'])).toEqual({ channels: [{ id: 'parent', unread: false }] })
    expect(cache.getQueryData(['dms'])).toEqual({ channels: [{ id: 'parent', unread: false }] })
  })

  it('invalidates lists so a hidden DM can reappear on new activity', () => {
    const cache = new QueryClient()
    cache.setQueryData(['channels', 'main'], { channels: [] })
    cache.setQueryData(['dms'], { channels: [] })

    applyWorkspaceRealtimeEvent(cache, {
      t: 'channel.activity',
      sourceChannelId: 'dm',
      rootChannelId: 'dm',
      messageId: '01990000-0000-7000-8000-000000000004',
    })

    expect(cache.getQueryState(['channels', 'main'])?.isInvalidated).toBe(true)
    expect(cache.getQueryState(['dms'])?.isInvalidated).toBe(true)
  })
})
