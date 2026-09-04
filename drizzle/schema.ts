import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { CHANNEL_PERMISSION_MASK } from '../shared/channel-permissions'

function isoTimestamps() {
  return {
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  }
}

function authTimestamps() {
  return {
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(sql`(cast(unixepoch() * 1000 as integer))`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(sql`(cast(unixepoch() * 1000 as integer))`),
  }
}

/** Better Auth owns the auth_* tables. Discoflare's domain identity lives in users. */
export const authUsers = sqliteTable('auth_users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  ...authTimestamps(),
})

export const authSessions = sqliteTable('auth_sessions', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  token: text('token').notNull().unique(),
  ...authTimestamps(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
}, table => [
  index('auth_sessions_user_id_idx').on(table.userId),
])

export const authAccounts = sqliteTable('auth_accounts', {
  id: text('id').primaryKey(),
  issuer: text('issuer').notNull(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
  scope: text('scope'),
  password: text('password'),
  ...authTimestamps(),
}, table => [
  uniqueIndex('auth_accounts_issuer_account_idx').on(table.issuer, table.accountId),
  index('auth_accounts_user_id_idx').on(table.userId),
])

export const authVerifications = sqliteTable('auth_verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`(cast(unixepoch() * 1000 as integer))`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).default(sql`(cast(unixepoch() * 1000 as integer))`),
})

/** Installation-wide admission policy and login-method switches. */
export const authSettings = sqliteTable('auth_settings', {
  id: text('id').primaryKey().default('main'),
  registrationMode: text('registration_mode', { enum: ['open', 'invite_only'] }).notNull().default('invite_only'),
  emailEnabled: integer('email_enabled', { mode: 'boolean' }).notNull().default(true),
  githubEnabled: integer('github_enabled', { mode: 'boolean' }).notNull().default(false),
  twitterEnabled: integer('twitter_enabled', { mode: 'boolean' }).notNull().default(false),
  telegramEnabled: integer('telegram_enabled', { mode: 'boolean' }).notNull().default(false),
  turnstileEnabled: integer('turnstile_enabled', { mode: 'boolean' }).notNull().default(false),
  emailFrom: text('email_from'),
  emailFromName: text('email_from_name'),
  ...isoTimestamps(),
}, table => [
  check('auth_settings_singleton_check', sql`${table.id} = 'main'`),
  check('auth_settings_registration_mode_check', sql`${table.registrationMode} in ('open', 'invite_only')`),
])

/** OAuth and Turnstile secrets entered in the owner UI. Secrets are AES-GCM encrypted. */
export const authProviderCredentials = sqliteTable('auth_provider_credentials', {
  provider: text('provider', { enum: ['github', 'twitter', 'telegram', 'turnstile'] }).primaryKey(),
  publicKey: text('public_key').notNull(),
  secretCiphertext: text('secret_ciphertext').notNull(),
  secretIv: text('secret_iv').notNull(),
  secretVersion: integer('secret_version').notNull().default(1),
  ...isoTimestamps(),
}, table => [
  check('auth_provider_credentials_provider_check', sql`${table.provider} in ('github', 'twitter', 'telegram', 'turnstile')`),
])

export const roles = sqliteTable('roles', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  permissionsBitmask: integer('permissions_bitmask').notNull(),
  position: integer('position').notNull().default(0),
  isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
  ...isoTimestamps(),
})

/** Workspace participants. Humans map to Better Auth identities; agents do not log in. */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['human', 'agent'] }).notNull().default('human'),
  handle: text('handle').unique(),
  displayName: text('display_name').notNull(),
  avatarR2Key: text('avatar_r2_key'),
  status: text('status', { enum: ['pending', 'active', 'removed'] }).notNull().default('pending'),
  roleId: text('role_id').references(() => roles.id),
  nickname: text('nickname'),
  joinedAt: text('joined_at'),
  ...isoTimestamps(),
}, table => [
  index('users_status_idx').on(table.status),
  index('users_kind_idx').on(table.kind),
  index('users_role_id_idx').on(table.roleId),
  check('users_kind_check', sql`${table.kind} in ('human', 'agent')`),
  check('users_status_check', sql`${table.status} in ('pending', 'active', 'removed')`),
  check('users_active_role_check', sql`${table.status} <> 'active' or (${table.roleId} is not null and ${table.joinedAt} is not null)`),
])

/** Stateful AI participant profile. Runtime memory lives in its Agent Durable Object. */
export const agents = sqliteTable('agents', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  model: text('model').notNull().default('@cf/moonshotai/kimi-k2.7-code'),
  instructions: text('instructions').notNull().default(''),
  status: text('status', { enum: ['active', 'paused'] }).notNull().default('active'),
  sandboxId: text('sandbox_id').notNull().unique(),
  createdBy: text('created_by').notNull().references(() => users.id),
  lastActiveAt: text('last_active_at'),
  ...isoTimestamps(),
}, table => [
  index('agents_status_idx').on(table.status),
  check('agents_status_check', sql`${table.status} in ('active', 'paused')`),
])

/** One row per installation. Its id is not copied into workspace-owned tables. */
export const workspace = sqliteTable('workspace', {
  id: text('id').primaryKey().default('main'),
  name: text('name').notNull(),
  iconR2Key: text('icon_r2_key'),
  ownerId: text('owner_id').notNull().references(() => users.id),
  ...isoTimestamps(),
}, table => [
  check('workspace_singleton_check', sql`${table.id} = 'main'`),
])

export const channelCategories = sqliteTable('channel_categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  position: integer('position').notNull().default(0),
  ...isoTimestamps(),
}, table => [
  index('channel_categories_position_idx').on(table.position),
])

export const channels = sqliteTable('channels', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  topic: text('topic').notNull().default(''),
  type: text('type', { enum: ['text', 'voice', 'thread', 'dm'] }).notNull(),
  visibility: text('visibility', { enum: ['workspace', 'private'] }).notNull().default('workspace'),
  categoryId: text('category_id').references(() => channelCategories.id, { onDelete: 'set null' }),
  position: integer('position').notNull().default(0),
  huddleMeetingId: text('huddle_meeting_id'),
  parentId: text('parent_id').references((): AnySQLiteColumn => channels.id, { onDelete: 'cascade' }),
  parentMessageId: text('parent_message_id').references((): AnySQLiteColumn => messages.id, { onDelete: 'cascade' }),
  ...isoTimestamps(),
}, table => [
  index('channels_position_idx').on(table.position),
  index('channels_type_idx').on(table.type),
  index('channels_category_id_idx').on(table.categoryId),
  index('channels_parent_id_idx').on(table.parentId),
  uniqueIndex('channels_thread_root_unique').on(table.parentMessageId).where(sql`${table.type} = 'thread'`),
  check('channels_type_check', sql`${table.type} in ('text', 'voice', 'thread', 'dm')`),
  check('channels_visibility_check', sql`${table.visibility} in ('workspace', 'private')`),
  check('channels_dm_private_check', sql`${table.type} <> 'dm' or ${table.visibility} = 'private'`),
  check('channels_thread_parent_check', sql`
    (${table.type} = 'thread' and ${table.parentId} is not null and ${table.parentMessageId} is not null)
    or (${table.type} <> 'thread' and ${table.parentId} is null and ${table.parentMessageId} is null)
  `),
])

/** Per-role send/attach/huddle exceptions for workspace channels. Threads inherit their parent. */
export const channelRoleOverrides = sqliteTable('channel_role_overrides', {
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  roleId: text('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  allowMask: integer('allow_mask').notNull().default(0),
  denyMask: integer('deny_mask').notNull().default(0),
  ...isoTimestamps(),
}, table => [
  primaryKey({ columns: [table.channelId, table.roleId] }),
  index('channel_role_overrides_role_id_idx').on(table.roleId),
  check('channel_role_overrides_allow_check', sql`(${table.allowMask} & ~${sql.raw(String(CHANNEL_PERMISSION_MASK))}) = 0`),
  check('channel_role_overrides_deny_check', sql`(${table.denyMask} & ~${sql.raw(String(CHANNEL_PERMISSION_MASK))}) = 0`),
  check('channel_role_overrides_disjoint_check', sql`(${table.allowMask} & ${table.denyMask}) = 0`),
])

/** Access to private channels, including DMs. Threads inherit their parent. */
export const channelMembers = sqliteTable('channel_members', {
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  hiddenAt: text('hidden_at'),
  joinedAt: text('joined_at').notNull(),
}, table => [
  primaryKey({ columns: [table.channelId, table.userId] }),
  index('channel_members_user_id_idx').on(table.userId),
])

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  replyToId: text('reply_to_id').references((): AnySQLiteColumn => messages.id, { onDelete: 'set null' }),
  editedAt: text('edited_at'),
  deletedAt: text('deleted_at'),
  createdAt: text('created_at').notNull(),
}, table => [
  index('messages_channel_created_idx').on(table.channelId, table.createdAt, table.id),
  index('messages_author_id_idx').on(table.authorId),
])

export const channelReads = sqliteTable('channel_reads', {
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  lastReadMessageId: text('last_read_message_id').references(() => messages.id, { onDelete: 'set null' }),
  updatedAt: text('updated_at').notNull(),
}, table => [
  primaryKey({ columns: [table.channelId, table.userId] }),
  index('channel_reads_user_id_idx').on(table.userId),
])

export const invites = sqliteTable('invites', {
  code: text('code').primaryKey(),
  creatorId: text('creator_id').notNull().references(() => users.id),
  maxUses: integer('max_uses').notNull().default(0),
  uses: integer('uses').notNull().default(0),
  expiresAt: text('expires_at'),
  createdAt: text('created_at').notNull(),
}, table => [
  index('invites_creator_id_idx').on(table.creatorId),
  index('invites_expires_at_idx').on(table.expiresAt),
])

export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  messageId: text('message_id').references(() => messages.id, { onDelete: 'cascade' }),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  uploaderId: text('uploader_id').notNull().references(() => users.id),
  r2Key: text('r2_key').notNull().unique(),
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  width: integer('width'),
  height: integer('height'),
  createdAt: text('created_at').notNull(),
}, table => [
  index('attachments_message_id_idx').on(table.messageId),
  index('attachments_channel_id_idx').on(table.channelId),
  index('attachments_uploader_id_idx').on(table.uploaderId),
  check('attachments_size_check', sql`${table.sizeBytes} > 0`),
])

export const messageReactions = sqliteTable('message_reactions', {
  messageId: text('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  emoji: text('emoji').notNull(),
  createdAt: text('created_at').notNull(),
}, table => [
  primaryKey({ columns: [table.messageId, table.userId, table.emoji] }),
  index('message_reactions_user_id_idx').on(table.userId),
])

export const messagePins = sqliteTable('message_pins', {
  messageId: text('message_id').primaryKey().references(() => messages.id, { onDelete: 'cascade' }),
  pinnedBy: text('pinned_by').notNull().references(() => users.id),
  pinnedAt: text('pinned_at').notNull(),
}, table => [
  index('message_pins_pinned_by_idx').on(table.pinnedBy),
  index('message_pins_pinned_at_idx').on(table.pinnedAt),
])

export const messageMentions = sqliteTable('message_mentions', {
  messageId: text('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
}, table => [
  primaryKey({ columns: [table.messageId, table.userId] }),
  index('message_mentions_user_id_idx').on(table.userId),
])

export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, table => [
  index('push_subscriptions_user_id_idx').on(table.userId),
])

export const notificationOutbox = sqliteTable('notification_outbox', {
  eventId: text('event_id').notNull(),
  subscriptionId: text('subscription_id').notNull().references(() => pushSubscriptions.id, { onDelete: 'cascade' }),
  recipientId: text('recipient_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['mention', 'dm_message', 'huddle_started'] }).notNull(),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  payloadJson: text('payload_json').notNull(),
  attempts: integer('attempts').notNull().default(0),
  availableAt: text('available_at').notNull(),
  leaseToken: text('lease_token'),
  leaseUntil: text('lease_until'),
  deliveredAt: text('delivered_at'),
  failedAt: text('failed_at'),
  lastError: text('last_error'),
  createdAt: text('created_at').notNull(),
}, table => [
  primaryKey({ columns: [table.eventId, table.subscriptionId] }),
  index('notification_outbox_due_idx').on(table.availableAt).where(sql`${table.deliveredAt} is null and ${table.failedAt} is null`),
  check('notification_outbox_kind_check', sql`${table.kind} in ('mention', 'dm_message', 'huddle_started')`),
])

export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  actorId: text('actor_id').notNull().references(() => users.id),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  metaJson: text('meta_json').notNull().default('{}'),
  createdAt: text('created_at').notNull(),
}, table => [
  index('audit_log_created_at_idx').on(table.createdAt),
  index('audit_log_actor_id_idx').on(table.actorId),
])

/** Task boards are shared product state, so they live in D1 rather than an Agent DO. */
export const taskBoards = sqliteTable('task_boards', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  position: integer('position').notNull().default(0),
  createdBy: text('created_by').notNull().references(() => users.id),
  ...isoTimestamps(),
}, table => [
  index('task_boards_position_idx').on(table.position),
])

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  boardId: text('board_id').notNull().references(() => taskBoards.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status', { enum: ['backlog', 'ready', 'running', 'review', 'done', 'failed'] }).notNull().default('backlog'),
  position: integer('position').notNull().default(0),
  assigneeId: text('assignee_id').references(() => agents.userId, { onDelete: 'set null' }),
  channelId: text('channel_id').references(() => channels.id, { onDelete: 'set null' }),
  createdBy: text('created_by').notNull().references(() => users.id),
  resultSummary: text('result_summary'),
  resultDetails: text('result_details'),
  lastError: text('last_error'),
  ...isoTimestamps(),
}, table => [
  index('tasks_board_status_position_idx').on(table.boardId, table.status, table.position),
  index('tasks_assignee_id_idx').on(table.assigneeId),
  check('tasks_status_check', sql`${table.status} in ('backlog', 'ready', 'running', 'review', 'done', 'failed')`),
])

export const taskRuns = sqliteTable('task_runs', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').notNull().references(() => agents.userId),
  workflowId: text('workflow_id').unique(),
  status: text('status', { enum: ['queued', 'running', 'completed', 'failed'] }).notNull().default('queued'),
  summary: text('summary'),
  details: text('details'),
  error: text('error'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull(),
}, table => [
  index('task_runs_task_created_idx').on(table.taskId, table.createdAt),
  index('task_runs_agent_status_idx').on(table.agentId, table.status),
  check('task_runs_status_check', sql`${table.status} in ('queued', 'running', 'completed', 'failed')`),
])

export const schema = {
  authUsers,
  authSessions,
  authAccounts,
  authVerifications,
  authSettings,
  authProviderCredentials,
  users,
  agents,
  workspace,
  roles,
  channelCategories,
  channels,
  channelRoleOverrides,
  channelMembers,
  messages,
  channelReads,
  invites,
  attachments,
  messageReactions,
  messagePins,
  messageMentions,
  pushSubscriptions,
  notificationOutbox,
  auditLog,
  taskBoards,
  tasks,
  taskRuns,
}
