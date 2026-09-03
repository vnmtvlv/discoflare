import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  avatarR2Key: text('avatar_r2_key'),
  createdAt: text('created_at').notNull(),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at').notNull(),
  userAgentHash: text('user_agent_hash').notNull(),
})

/** Better Auth identity. App profile stays on `users` with the same id. */
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(sql`(cast(unixepoch() * 1000 as integer))`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(sql`(cast(unixepoch() * 1000 as integer))`),
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(sql`(cast(unixepoch() * 1000 as integer))`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(sql`(cast(unixepoch() * 1000 as integer))`),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
})

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  issuer: text('issuer').notNull(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(sql`(cast(unixepoch() * 1000 as integer))`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(sql`(cast(unixepoch() * 1000 as integer))`),
}, (t) => [
  uniqueIndex('account_issuer_account_id').on(t.issuer, t.accountId),
  index('account_user_id').on(t.userId),
])

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`(cast(unixepoch() * 1000 as integer))`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).default(sql`(cast(unixepoch() * 1000 as integer))`),
})

/** One row per install. The product is a single workspace, not a guild list. */
export const guilds = sqliteTable('guilds', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  iconR2Key: text('icon_r2_key'),
  ownerId: text('owner_id').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
})

export const channels = sqliteTable('channels', {
  id: text('id').primaryKey(),
  guildId: text('guild_id').notNull().references(() => guilds.id),
  name: text('name').notNull(),
  topic: text('topic').notNull().default(''),
  type: text('type', { enum: ['text', 'voice', 'thread', 'dm'] }).notNull(),
  position: integer('position').notNull().default(0),
  huddleMeetingId: text('huddle_meeting_id'),
  parentId: text('parent_id'),
  parentMessageId: text('parent_message_id'),
  createdAt: text('created_at').notNull(),
})

export const roles = sqliteTable('roles', {
  id: text('id').primaryKey(),
  guildId: text('guild_id').notNull().references(() => guilds.id),
  name: text('name').notNull(),
  permissionsBitmask: integer('permissions_bitmask').notNull(),
  position: integer('position').notNull().default(0),
  createdAt: text('created_at').notNull(),
})

export const guildMembers = sqliteTable('guild_members', {
  guildId: text('guild_id').notNull().references(() => guilds.id),
  userId: text('user_id').notNull().references(() => users.id),
  roleId: text('role_id').notNull().references(() => roles.id),
  lastSeenAt: text('last_seen_at').notNull(),
  nickname: text('nickname'),
}, (t) => [
  primaryKey({ columns: [t.guildId, t.userId] }),
])

export const channelReads = sqliteTable('channel_reads', {
  guildId: text('guild_id').notNull(),
  channelId: text('channel_id').notNull().references(() => channels.id),
  userId: text('user_id').notNull().references(() => users.id),
  lastReadMessageId: text('last_read_message_id'),
  updatedAt: text('updated_at').notNull(),
}, (t) => [
  primaryKey({ columns: [t.channelId, t.userId] }),
])

export const invites = sqliteTable('invites', {
  code: text('code').primaryKey(),
  guildId: text('guild_id').notNull().references(() => guilds.id),
  creatorId: text('creator_id').notNull().references(() => users.id),
  maxUses: integer('max_uses').notNull().default(0),
  uses: integer('uses').notNull().default(0),
  expiresAt: text('expires_at'),
  createdAt: text('created_at').notNull(),
})

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  channelId: text('channel_id').notNull().references(() => channels.id),
  guildId: text('guild_id').notNull().references(() => guilds.id),
  authorId: text('author_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  replyToId: text('reply_to_id'),
  editedAt: text('edited_at'),
  deletedAt: text('deleted_at'),
  createdAt: text('created_at').notNull(),
}, (t) => [
  index('messages_channel_created').on(t.channelId, t.createdAt),
  index('messages_channel_id').on(t.channelId, t.id),
])

export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  messageId: text('message_id').references(() => messages.id),
  r2Key: text('r2_key').notNull(),
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  width: integer('width'),
  height: integer('height'),
  createdAt: text('created_at').notNull(),
})

export const dmParticipants = sqliteTable('dm_participants', {
  channelId: text('channel_id').notNull().references(() => channels.id),
  userId: text('user_id').notNull().references(() => users.id),
  hiddenAt: text('hidden_at'),
  joinedAt: text('joined_at').notNull(),
}, (t) => [
  primaryKey({ columns: [t.channelId, t.userId] }),
])

export const messageReactions = sqliteTable('message_reactions', {
  messageId: text('message_id').notNull().references(() => messages.id),
  userId: text('user_id').notNull().references(() => users.id),
  emoji: text('emoji').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => [
  primaryKey({ columns: [t.messageId, t.userId, t.emoji] }),
])

export const messageMentions = sqliteTable('message_mentions', {
  messageId: text('message_id').notNull().references(() => messages.id),
  userId: text('user_id').notNull().references(() => users.id),
}, (t) => [
  primaryKey({ columns: [t.messageId, t.userId] }),
])

export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  guildId: text('guild_id').notNull().references(() => guilds.id),
  actorId: text('actor_id').notNull().references(() => users.id),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  metaJson: text('meta_json').notNull().default('{}'),
  createdAt: text('created_at').notNull(),
})

export const schema = {
  users,
  sessions,
  user,
  session,
  account,
  verification,
  guilds,
  channels,
  roles,
  guildMembers,
  channelReads,
  invites,
  messages,
  attachments,
  dmParticipants,
  messageReactions,
  messageMentions,
  auditLog,
}
