import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { channelUnreadCountSql, channelUnreadCountsSql, channelUnreadSql } from '../../workers/unread'

let db: DatabaseSync

function hasUnread(userId: string, channelId: string): boolean {
  const row = db.prepare(channelUnreadSql).get(channelId, channelId, userId) as { unread: number }
  return row.unread === 1
}

function unreadCount(userId: string, channelId: string): number {
  const row = db.prepare(channelUnreadCountSql).get(userId, channelId, channelId) as { unread_count: number }
  return row.unread_count
}

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE channels (id TEXT PRIMARY KEY, type TEXT NOT NULL, parent_id TEXT);
    CREATE TABLE messages (id TEXT PRIMARY KEY, channel_id TEXT NOT NULL);
    CREATE TABLE channel_reads (
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      last_read_message_id TEXT,
      PRIMARY KEY (channel_id, user_id)
    );
  `)
})

afterEach(() => db.close())

describe('channel unread aggregation', () => {
  it('keeps a DM unread while one of its threads has unread replies', () => {
    db.exec(`
      INSERT INTO channels VALUES ('dm-1', 'dm', NULL), ('thread-1', 'thread', 'dm-1');
      INSERT INTO messages VALUES
        ('01990000-0000-7000-8000-000000000001', 'dm-1'),
        ('01990000-0000-7000-8000-000000000002', 'thread-1');
      INSERT INTO channel_reads VALUES
        ('dm-1', 'user-1', '01990000-0000-7000-8000-000000000001');
    `)

    expect(hasUnread('user-1', 'dm-1')).toBe(true)
    expect(unreadCount('user-1', 'dm-1')).toBe(1)

    db.exec(`
      INSERT INTO channel_reads VALUES
        ('thread-1', 'user-1', '01990000-0000-7000-8000-000000000002');
    `)
    expect(hasUnread('user-1', 'dm-1')).toBe(false)
    expect(unreadCount('user-1', 'dm-1')).toBe(0)
  })

  it('counts unread root and thread messages independently from their cursors', () => {
    db.exec(`
      INSERT INTO channels VALUES ('channel-1', 'text', NULL), ('thread-1', 'thread', 'channel-1');
      INSERT INTO messages VALUES
        ('01990000-0000-7000-8000-000000000001', 'channel-1'),
        ('01990000-0000-7000-8000-000000000002', 'channel-1'),
        ('01990000-0000-7000-8000-000000000003', 'thread-1');
      INSERT INTO channel_reads VALUES
        ('channel-1', 'user-1', '01990000-0000-7000-8000-000000000001');
    `)

    expect(unreadCount('user-1', 'channel-1')).toBe(2)
  })

  it('counts many root channels with one grouped query', () => {
    db.exec(`
      INSERT INTO channels VALUES
        ('channel-1', 'text', NULL),
        ('channel-2', 'text', NULL),
        ('thread-1', 'thread', 'channel-1');
      INSERT INTO messages VALUES
        ('01990000-0000-7000-8000-000000000001', 'channel-1'),
        ('01990000-0000-7000-8000-000000000002', 'thread-1'),
        ('01990000-0000-7000-8000-000000000003', 'channel-2');
      INSERT INTO channel_reads VALUES
        ('channel-1', 'user-1', '01990000-0000-7000-8000-000000000001');
    `)

    const rows = db.prepare(channelUnreadCountsSql(2)).all('user-1', 'channel-1', 'channel-2')
    expect(rows).toEqual([
      { channel_id: 'channel-1', unread_count: 1 },
      { channel_id: 'channel-2', unread_count: 1 },
    ])
  })

  it('does not let an older tab regress a newer read cursor', () => {
    db.exec(`
      INSERT INTO channels VALUES ('channel-1', 'text', NULL);
      INSERT INTO messages VALUES
        ('01990000-0000-7000-8000-000000000001', 'channel-1'),
        ('01990000-0000-7000-8000-000000000002', 'channel-1');
      INSERT INTO channel_reads VALUES
        ('channel-1', 'user-1', '01990000-0000-7000-8000-000000000002');
      INSERT INTO channel_reads VALUES
        ('channel-1', 'user-1', '01990000-0000-7000-8000-000000000001')
      ON CONFLICT(channel_id, user_id) DO UPDATE
      SET last_read_message_id = excluded.last_read_message_id
      WHERE channel_reads.last_read_message_id IS NULL
         OR channel_reads.last_read_message_id < excluded.last_read_message_id;
    `)

    expect(hasUnread('user-1', 'channel-1')).toBe(false)
    expect(db.prepare(
      'SELECT last_read_message_id FROM channel_reads WHERE channel_id = ? AND user_id = ?',
    ).get('channel-1', 'user-1')).toEqual({
      last_read_message_id: '01990000-0000-7000-8000-000000000002',
    })
  })
})
