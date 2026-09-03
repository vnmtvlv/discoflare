/// <reference types="@cloudflare/workers-types" />
import { drizzle } from 'drizzle-orm/d1'
import { schema } from '../../drizzle/schema'

export function getDb(d1: D1Database) {
  return drizzle(d1, { schema })
}

export function d1ExecSql(sql: string): string {
  return sql
    .split(';')
    .map(statement => statement.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map(statement => `${statement};`)
    .join('\n')
}

const RAW_INIT_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_r2_key TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS guilds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon_r2_key TEXT,
  owner_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  huddle_meeting_id TEXT,
  parent_id TEXT,
  parent_message_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  permissions_bitmask INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS guild_members (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  nickname TEXT,
  PRIMARY KEY (guild_id, user_id)
);
CREATE TABLE IF NOT EXISTS channel_reads (
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  last_read_message_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (channel_id, user_id)
);
CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 0,
  uses INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  content TEXT NOT NULL,
  reply_to_id TEXT,
  edited_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_channel_created ON messages (channel_id, created_at);
CREATE INDEX IF NOT EXISTS messages_channel_id ON messages (channel_id, id);
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT,
  r2_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dm_participants (
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  hidden_at TEXT,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (channel_id, user_id)
);
CREATE TABLE IF NOT EXISTS message_reactions (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);
CREATE TABLE IF NOT EXISTS message_mentions (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id)
);
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
`

export const INIT_SQL = d1ExecSql(RAW_INIT_SQL)

export async function ensureMigrated(db: D1Database): Promise<boolean> {
  try {
    await db.prepare('SELECT id FROM users LIMIT 1').first()
  }
  catch {
    await db.exec(INIT_SQL)
  }
  await ensureForward(db)
  return true
}

async function execIgnore(db: D1Database, sql: string) {
  try {
    await db.exec(d1ExecSql(sql))
  }
  catch {
    // already applied
  }
}

async function ensureForward(db: D1Database) {
  await execIgnore(db, `CREATE TABLE IF NOT EXISTS dm_participants (
    channel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    hidden_at TEXT,
    joined_at TEXT NOT NULL,
    PRIMARY KEY (channel_id, user_id)
  )`)
  await execIgnore(db, `CREATE TABLE IF NOT EXISTS message_reactions (
    message_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (message_id, user_id, emoji)
  )`)

  let hasParent = true
  try {
    await db.prepare('SELECT parent_id FROM channels LIMIT 1').first()
  }
  catch {
    hasParent = false
  }
  if (!hasParent) {
    await db.exec(d1ExecSql(`
      CREATE TABLE channels_v2 (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        name TEXT NOT NULL,
        topic TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        huddle_meeting_id TEXT,
        parent_id TEXT,
        parent_message_id TEXT,
        created_at TEXT NOT NULL
      );
      INSERT INTO channels_v2 (id, guild_id, name, topic, type, position, huddle_meeting_id, parent_id, parent_message_id, created_at)
      SELECT id, guild_id, name, topic,
        CASE type WHEN 'huddle' THEN 'voice' ELSE type END,
        position, huddle_meeting_id, NULL, NULL, created_at
      FROM channels;
      DROP TABLE channels;
      ALTER TABLE channels_v2 RENAME TO channels;
    `))
  }
  else {
    await execIgnore(db, `UPDATE channels SET type = 'voice' WHERE type = 'huddle'`)
  }

  await execIgnore(db, `CREATE TABLE IF NOT EXISTS user (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    email_verified INTEGER NOT NULL DEFAULT 0,
    image TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)
  await execIgnore(db, `CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    user_id TEXT NOT NULL
  )`)
  await execIgnore(db, `CREATE TABLE IF NOT EXISTS account (
    id TEXT PRIMARY KEY,
    issuer TEXT NOT NULL,
    account_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    id_token TEXT,
    access_token_expires_at INTEGER,
    refresh_token_expires_at INTEGER,
    scope TEXT,
    password TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)
  await execIgnore(db, `ALTER TABLE account ADD COLUMN issuer TEXT NOT NULL DEFAULT 'local:credential'`)
  await execIgnore(db, `CREATE UNIQUE INDEX IF NOT EXISTS account_issuer_account_id ON account (issuer, account_id)`)
  await execIgnore(db, `CREATE INDEX IF NOT EXISTS account_user_id ON account (user_id)`)
  await execIgnore(db, `CREATE TABLE IF NOT EXISTS verification (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER,
    updated_at INTEGER
  )`)
  await execIgnore(db, `INSERT OR IGNORE INTO user (id, name, email, email_verified, image, created_at, updated_at)
    SELECT id, display_name, email, 1, avatar_r2_key,
      CAST(strftime('%s', created_at) AS INTEGER) * 1000,
      CAST(strftime('%s', created_at) AS INTEGER) * 1000
    FROM users`)
  await execIgnore(db, `INSERT OR IGNORE INTO account (id, issuer, account_id, provider_id, user_id, password, created_at, updated_at)
    SELECT id, 'local:credential', id, 'credential', id, password_hash,
      CAST(strftime('%s', created_at) AS INTEGER) * 1000,
      CAST(strftime('%s', created_at) AS INTEGER) * 1000
    FROM users`)
}

export async function userCount(db: D1Database): Promise<number> {
  try {
    const row = await db.prepare('SELECT COUNT(*) as c FROM users').first<{ c: number }>()
    return row?.c ?? 0
  }
  catch {
    return 0
  }
}
