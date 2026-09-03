-- DMs, threads, reactions; relax channel types (huddle → voice)
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
