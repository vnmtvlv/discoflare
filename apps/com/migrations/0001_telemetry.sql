CREATE TABLE installations (
  installation_id TEXT PRIMARY KEY NOT NULL,
  account_worker_hash TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL,
  version TEXT NOT NULL,
  deployments INTEGER NOT NULL DEFAULT 1,
  has_d1 INTEGER NOT NULL DEFAULT 1,
  has_r2 INTEGER NOT NULL DEFAULT 1,
  has_kv INTEGER NOT NULL DEFAULT 1,
  has_custom_domain INTEGER NOT NULL DEFAULT 1,
  has_email INTEGER NOT NULL DEFAULT 0,
  has_agents INTEGER NOT NULL DEFAULT 1,
  has_huddles INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL,
  last_deployed_at TEXT NOT NULL,
  last_heartbeat_at TEXT
);

CREATE INDEX installations_last_heartbeat_idx ON installations(last_heartbeat_at);
