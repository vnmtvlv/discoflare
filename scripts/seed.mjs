import { spawnSync } from 'node:child_process'
import { scryptAsync } from '@noble/hashes/scrypt.js'
import { bytesToHex, randomBytes } from '@noble/hashes/utils.js'
import { uuidv7 } from 'uuidv7'
import { writeFileSync, unlinkSync } from 'node:fs'

const password = process.env.SEED_PASSWORD || 'password12'
const salt = randomBytes(16)
const key = await scryptAsync(password, salt, { N: 16384, r: 8, p: 1, dkLen: 32 })
const hash = `scrypt$16384$8$1$${bytesToHex(salt)}$${bytesToHex(key)}`

const ownerId = uuidv7()
const memberId = uuidv7()
const guildId = uuidv7()
const ownerRole = uuidv7()
const memberRole = uuidv7()
const adminRole = uuidv7()
const generalId = uuidv7()
const huddleId = uuidv7()
const now = new Date().toISOString()

const sql = `
INSERT INTO users (id, email, password_hash, display_name, created_at) VALUES
  ('${ownerId}', 'owner@local.test', '${hash}', 'Owner', '${now}'),
  ('${memberId}', 'member@local.test', '${hash}', 'Member', '${now}');
INSERT INTO guilds (id, name, owner_id, created_at) VALUES ('${guildId}', 'Local', '${ownerId}', '${now}');
INSERT INTO roles (id, guild_id, name, permissions_bitmask, position, created_at) VALUES
  ('${ownerRole}', '${guildId}', 'owner', 255, 0, '${now}'),
  ('${adminRole}', '${guildId}', 'admin', 255, 1, '${now}'),
  ('${memberRole}', '${guildId}', 'member', 112, 2, '${now}');
INSERT INTO guild_members (guild_id, user_id, role_id, last_seen_at) VALUES
  ('${guildId}', '${ownerId}', '${ownerRole}', '${now}'),
  ('${guildId}', '${memberId}', '${memberRole}', '${now}');
INSERT INTO channels (id, guild_id, name, topic, type, position, created_at) VALUES
  ('${generalId}', '${guildId}', 'general', '', 'text', 0, '${now}'),
  ('${huddleId}', '${guildId}', 'huddle', '', 'huddle', 1, '${now}');
`

const file = 'scripts/.seed.sql'
writeFileSync(file, sql)
const r = spawnSync('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'discoflare', '--local', `--file=${file}`], { stdio: 'inherit' })
unlinkSync(file)
if (r.status !== 0) process.exit(r.status ?? 1)
console.log('Seeded owner@local.test / member@local.test password:', password)
