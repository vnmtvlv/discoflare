-- Better Auth identity tables. App profile remains `users` with the same id.
CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  password TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER,
  updated_at INTEGER
);

INSERT OR IGNORE INTO user (id, name, email, email_verified, image, created_at, updated_at)
SELECT
  id,
  display_name,
  email,
  1,
  avatar_r2_key,
  CAST(strftime('%s', created_at) AS INTEGER) * 1000,
  CAST(strftime('%s', created_at) AS INTEGER) * 1000
FROM users;

INSERT OR IGNORE INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
SELECT
  id,
  id,
  'credential',
  id,
  password_hash,
  CAST(strftime('%s', created_at) AS INTEGER) * 1000,
  CAST(strftime('%s', created_at) AS INTEGER) * 1000
FROM users;
