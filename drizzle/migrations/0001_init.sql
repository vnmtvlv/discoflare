-- Discoflare v0.1 catalog
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_r2_key TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent_hash TEXT NOT NULL
);

CREATE TABLE guilds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon_r2_key TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL REFERENCES guilds(id),
  name TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('text', 'huddle')),
  position INTEGER NOT NULL DEFAULT 0,
  huddle_meeting_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL REFERENCES guilds(id),
  name TEXT NOT NULL,
  permissions_bitmask INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE guild_members (
  guild_id TEXT NOT NULL REFERENCES guilds(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role_id TEXT NOT NULL REFERENCES roles(id),
  last_seen_at TEXT NOT NULL,
  nickname TEXT,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE channel_reads (
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  last_read_message_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE invites (
  code TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL REFERENCES guilds(id),
  creator_id TEXT NOT NULL REFERENCES users(id),
  max_uses INTEGER NOT NULL DEFAULT 0,
  uses INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  guild_id TEXT NOT NULL REFERENCES guilds(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  reply_to_id TEXT,
  edited_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX messages_channel_created ON messages (channel_id, created_at);
CREATE INDEX messages_channel_id ON messages (channel_id, id);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT REFERENCES messages(id),
  r2_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE message_mentions (
  message_id TEXT NOT NULL REFERENCES messages(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL REFERENCES guilds(id),
  actor_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
