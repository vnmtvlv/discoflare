export type PresenceStatus = 'online' | 'idle' | 'offline'
export type ChannelType = 'text' | 'voice' | 'thread' | 'dm'

export type PublicUser = {
  id: string
  displayName: string
  email: string
  avatarR2Key: string | null
}

export type AttachmentDTO = {
  id: string
  filename: string
  contentType: string
  sizeBytes: number
  width: number | null
  height: number | null
  url: string
}

export type ReactionDTO = {
  emoji: string
  count: number
  me: boolean
}

export type MessageDTO = {
  id: string
  channelId: string
  guildId: string
  author: PublicUser
  content: string
  replyTo: { id: string; authorId: string; content: string } | null
  mentions: string[]
  attachments: AttachmentDTO[]
  reactions: ReactionDTO[]
  threadId: string | null
  editedAt: string | null
  deletedAt: string | null
  createdAt: string
  clientId?: string
}

export type HuddleState = {
  active: boolean
  huddleId: string | null
  meetingId: string | null
  participantIds: string[]
  startedBy: string | null
  startedAt: string | null
}

export type GuildDTO = {
  id: string
  name: string
  iconR2Key: string | null
  ownerId: string
  createdAt: string
}

export type ChannelDTO = {
  id: string
  guildId: string
  name: string
  topic: string
  type: ChannelType
  position: number
  huddleMeetingId: string | null
  parentId: string | null
  parentMessageId: string | null
  unread: boolean
  huddle: HuddleState | null
  createdAt: string
  title?: string
  participants?: PublicUser[]
  frozen?: boolean
  lastMessageAt?: string | null
}

export type RoleDTO = {
  id: string
  guildId: string
  name: string
  permissions: number
  position: number
}

export type MemberDTO = {
  user: PublicUser
  role: RoleDTO
  nickname: string | null
  lastSeenAt: string
  status: PresenceStatus
}

export type AuditEntryDTO = {
  id: string
  guildId: string
  actorId: string
  actorName: string
  action: string
  targetType: string
  targetId: string
  meta: Record<string, unknown>
  createdAt: string
}

export type InvitePreviewDTO = {
  code: string
  guildId: string
  guildName: string
  expiresAt: string | null
  uses: number
  maxUses: number
}

export type SetupHealth = {
  ok: boolean
  users: number
  migrated: boolean
  adminEnv: boolean
  bindings: {
    db: boolean
    r2: boolean
    kv: boolean
    channelDo: boolean
    guildDo: boolean
    rateLimitDo: boolean
  }
  realtimekit: boolean
}

export type ClientMsg =
  | { t: 'auth'; token: string }
  | { t: 'message.create'; content: string; replyToId?: string; clientId: string; attachmentIds?: string[] }
  | { t: 'message.update'; id: string; content: string }
  | { t: 'message.delete'; id: string }
  | { t: 'typing' }
  | { t: 'read'; messageId: string }
  | { t: 'huddle.start' }
  | { t: 'huddle.join' }
  | { t: 'huddle.leave' }
  | { t: 'voice.join' }
  | { t: 'voice.leave' }
  | { t: 'reaction.add'; messageId: string; emoji: string }
  | { t: 'reaction.remove'; messageId: string; emoji: string }

export type ServerMsg =
  | { t: 'hello'; channelId: string; you: PublicUser; huddle?: HuddleState; frozen?: boolean; participants?: PublicUser[] }
  | { t: 'message'; message: MessageDTO }
  | { t: 'message.update'; message: MessageDTO }
  | { t: 'message.delete'; id: string }
  | { t: 'typing'; userId: string }
  | { t: 'presence'; users: Array<{ userId: string; status: PresenceStatus }> }
  | { t: 'huddle'; huddle: HuddleState }
  | { t: 'voice'; voice: HuddleState }
  | { t: 'dm.participants'; participants: PublicUser[] }
  | { t: 'dm.update'; name: string | null }
  | { t: 'reaction'; messageId: string; emoji: string; userId: string; op: 'add' | 'remove' }
  | { t: 'error'; code: string; message: string }
  | { t: 'ack'; clientId: string; id: string }

export type GuildClientMsg = { t: 'auth'; token: string } | { t: 'activity' }

export type GuildServerMsg =
  | { t: 'hello'; guildId: string }
  | { t: 'presence'; users: Array<{ userId: string; status: PresenceStatus }> }
  | { t: 'error'; code: string; message: string }
