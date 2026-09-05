import type { JSONContent } from '@tiptap/core'

export type PresenceStatus = 'online' | 'idle' | 'offline'
export type UserStatus = 'pending' | 'active' | 'removed'
export type UserKind = 'human' | 'agent'
export type ChannelType = 'text' | 'voice' | 'thread' | 'dm'
export type ChannelVisibility = 'workspace' | 'private'

export type PublicUser = {
  id: string
  kind: UserKind
  displayName: string
  avatarR2Key: string | null
}

export type AgentDTO = {
  id: string
  displayName: string
  avatarR2Key: string | null
  model: string
  instructions: string
  status: 'active' | 'paused'
  sandboxId: string
  lastActiveAt: string | null
  createdAt: string
  updatedAt: string
}

export type TaskAgentDTO = Pick<AgentDTO, 'id' | 'displayName' | 'avatarR2Key' | 'status'>

export type AgentApprovalDTO = {
  executionId: string
  action: string
  summary: string
  input: unknown
  risk?: 'low' | 'medium' | 'high'
}

export type AgentTurnDTO = {
  submissionId: string
  agentId: string
  channelId: string
  sourceMessageId: string
  initiatedBy: string
  status: 'queued' | 'thinking' | 'tool' | 'waiting_approval'
  detail: string | null
  draftMessageId: string | null
  approval: AgentApprovalDTO | null
  createdAt: string
  updatedAt: string
}

export type TaskStatus = 'backlog' | 'ready' | 'running' | 'review' | 'done' | 'failed'
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'

export type TaskLabelDTO = {
  id: string
  boardId: string
  name: string
  color: string
  position: number
  createdAt: string
  updatedAt: string
}

export type TaskChecklistItemDTO = {
  id: string
  taskId: string
  title: string
  completed: boolean
  position: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type TaskAttachmentDTO = AttachmentDTO & {
  taskId: string
  uploaderId: string
  createdAt: string
}

export type TaskRunDTO = {
  id: string
  taskId: string
  agentId: string
  workflowId: string | null
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  triggeredBy: string | null
  titleSnapshot: string
  descriptionSnapshot: string
  channelIdSnapshot: string | null
  agentModelSnapshot: string
  agentInstructionsSnapshot: string
  taskStatusBefore: Exclude<TaskStatus, 'running'>
  summary: string | null
  details: string | null
  error: string | null
  progress: string | null
  startedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  cancelledBy: string | null
  createdAt: string
}

export type TaskDTO = {
  id: string
  boardId: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  dueAt: string | null
  position: number
  assigneeId: string | null
  channelId: string | null
  createdBy: string
  resultSummary: string | null
  resultDetails: string | null
  lastError: string | null
  activeRunId: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  labels: TaskLabelDTO[]
  checklistTotal: number
  checklistCompleted: number
  dependencyIds: string[]
  attachmentCount: number
  latestRun: TaskRunDTO | null
}

export type TaskDetailDTO = TaskDTO & {
  runs: TaskRunDTO[]
  checklist: TaskChecklistItemDTO[]
  attachments: TaskAttachmentDTO[]
}

export type TaskBoardDTO = {
  id: string
  name: string
  position: number
  createdBy: string
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  labels: TaskLabelDTO[]
  tasks: TaskDTO[]
}

export type MailboxPermission = 'read' | 'send' | 'manage'
export type MailThreadStatus = 'inbox' | 'archive' | 'spam' | 'trash'

export type MailboxDTO = {
  channelId: string
  address: string
  displayName: string
  enabled: boolean
  permission: MailboxPermission
  unreadCount: number
}

export type MailThreadDTO = {
  channelId: string
  mailboxChannelId: string
  subject: string
  status: MailThreadStatus
  participants: string[]
  preview: string
  lastMessageAt: string
  unread: boolean
}

export type MailMessageDTO = MessageDTO & {
  email: null | {
    direction: 'inbound' | 'outbound'
    fromAddress: string
    fromName: string | null
    to: string[]
    cc: string[]
    bcc: string[]
    deliveryStatus: 'received' | 'pending' | 'sent' | 'failed'
  }
}

export type MailSettingsDTO = {
  configured: boolean
  domain: string | null
  appHostname: string | null
  sendingBound: boolean
  mailboxes: Array<MailboxDTO & { access: Array<{ userId: string; permission: MailboxPermission }> }>
}

export type SessionUser = PublicUser & {
  email: string | null
  status: UserStatus
  onboardingRequired: boolean
}

export type RegistrationMode = 'open' | 'invite_only'
export type AuthLoginMethod = 'email' | 'github' | 'twitter' | 'telegram'
export type AuthCredentialProvider = Exclude<AuthLoginMethod, 'email'> | 'turnstile'

export type PublicAuthConfig = {
  registrationMode: RegistrationMode
  signupEnabled: boolean
  emailSignupEnabled: boolean
  passwordResetEnabled: boolean
  methods: Record<AuthLoginMethod, boolean>
  turnstile: { enabled: boolean; siteKey: string | null }
}

export type RichTextDocument = JSONContent & {
  type: 'doc'
}

export type PublicOnboardingConfig = {
  revisionId: string | null
  version: number
  privacy: RichTextDocument | null
  terms: RichTextDocument | null
  rules: RichTextDocument | null
  acceptanceRequired: boolean
  publishedAt: string | null
}

export type AuthProviderAdminDTO = {
  provider: AuthCredentialProvider
  enabled: boolean
  configured: boolean
  effective: boolean
  source: 'deployment' | 'database' | 'missing'
  publicKey: string | null
  secretReadable: boolean
}

export type AuthSettingsAdminDTO = PublicAuthConfig & {
  email: {
    enabled: boolean
    binding: boolean
    sender: string | null
    senderName: string | null
    verificationReady: boolean
    senderManagedByDeployment: boolean
  }
  providers: Record<AuthCredentialProvider, AuthProviderAdminDTO>
}

export type RealtimeKitSettingsAdminDTO = {
  configured: boolean
  source: 'deployment' | 'database' | 'missing'
  accountId: string | null
  appId: string | null
  apiTokenConfigured: boolean
  secretReadable: boolean
  voicePreset: string
  avPreset: string
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

export type MessagePinDTO = {
  pinnedBy: PublicUser
  pinnedAt: string
}

export type ReplyPreviewDTO = {
  id: string
  authorId: string
  content: string
  attachmentCount: number
  deleted: boolean
}

export type MessageDTO = {
  id: string
  channelId: string
  workspaceId: string
  author: PublicUser
  content: string
  replyTo: ReplyPreviewDTO | null
  mentions: string[]
  attachments: AttachmentDTO[]
  reactions: ReactionDTO[]
  pin: MessagePinDTO | null
  threadId: string | null
  editedAt: string | null
  deletedAt: string | null
  createdAt: string
  clientId?: string
  deliveryState?: 'uploading' | 'sending' | 'failed'
}

export type MessageSearchChannelDTO = {
  id: string
  name: string
  type: ChannelType
  parentId: string | null
  parentMessageId: string | null
}

export type MessageSearchHitDTO = {
  id: string
  channel: MessageSearchChannelDTO
  author: PublicUser
  content: string
  editedAt: string | null
  createdAt: string
}

export type MessageSearchResponse = {
  hits: MessageSearchHitDTO[]
  nextCursor: string | null
}

export type MessageContextResponse = {
  messages: MessageDTO[]
  targetId: string
  targetIndex: number
  hasOlder: boolean
  hasNewer: boolean
}

export type HuddleState = {
  active: boolean
  huddleId: string | null
  meetingId: string | null
  participantIds: string[]
  startedBy: string | null
  startedAt: string | null
}

export type WorkspaceDTO = {
  id: string
  name: string
  iconR2Key: string | null
  ownerId: string
  createdAt: string
  updatedAt: string
}

export type ChannelCategoryDTO = {
  id: string
  name: string
  position: number
  createdAt: string
}

export type ChannelRoleOverrideDTO = {
  channelId: string
  roleId: string
  allow: number
  deny: number
}

export type RightPanelTab = 'members' | 'threads' | 'pins' | 'files'

export type ChannelThreadDTO = {
  id: string
  parentMessageId: string
  title: string
  author: PublicUser
  replyCount: number
  lastReplyAt: string | null
  createdAt: string
}

export type ChannelFileDTO = AttachmentDTO & {
  messageId: string
  uploader: PublicUser
  createdAt: string
}

export type ChannelDTO = {
  id: string
  workspaceId: string
  name: string
  topic: string
  type: ChannelType
  visibility: ChannelVisibility
  categoryId: string | null
  position: number
  huddleMeetingId: string | null
  parentId: string | null
  parentMessageId: string | null
  unread: boolean
  unreadCount?: number
  permissions?: number
  huddle: HuddleState | null
  createdAt: string
  title?: string
  participants?: PublicUser[]
  frozen?: boolean
  lastMessageAt?: string | null
}

export type RoleDTO = {
  id: string
  workspaceId: string
  key: string
  name: string
  permissions: number
  position: number
  isSystem: boolean
  memberCount?: number
}

export type MemberDTO = {
  user: PublicUser
  role: RoleDTO
  nickname: string | null
  status: PresenceStatus
}

export type AuditEntryDTO = {
  id: string
  workspaceId: string
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
  workspaceId: string
  workspaceName: string
  expiresAt: string | null
  uses: number
  maxUses: number
}

export type SetupHealth = {
  ok: boolean
  ready: boolean
  users: number
  migrated: boolean
  adminEnv: boolean
  ownerSetup: boolean
  ownerEmailHint: string | null
  bindings: {
    db: boolean
    r2: boolean
    kv: boolean
    channelDo: boolean
    workspaceDo: boolean
    rateLimitDo: boolean
    notificationDo: boolean
    agentDo: boolean
    agentSandbox: boolean
    agentWorkflow: boolean
    workersAi: boolean
  }
  realtimekit: boolean
  twitterAuth: boolean
  appName: string
  appTitle: string
  appSubtitle: string
}

export type ClientMsg =
  | { t: 'auth'; token: string }
  | { t: 'message.create'; content: string; replyToId?: string; clientId: string; attachmentIds?: string[]; agentMode?: 'queue' | 'steer' }
  | { t: 'message.update'; id: string; content: string }
  | { t: 'message.delete'; id: string }
  | { t: 'typing'; active: boolean }
  | { t: 'read'; messageId: string }
  | { t: 'huddle.start' }
  | { t: 'huddle.join' }
  | { t: 'huddle.leave' }
  | { t: 'voice.join' }
  | { t: 'voice.leave' }
  | { t: 'reaction.add'; messageId: string; emoji: string }
  | { t: 'reaction.remove'; messageId: string; emoji: string }
  | { t: 'agent.control'; agentId: string; action: 'stop' | 'approve' | 'reject'; executionId?: string }

export type ServerMsg =
  | { t: 'hello'; channelId: string; you: PublicUser; huddle?: HuddleState; frozen?: boolean; participants?: PublicUser[]; agentTurns?: AgentTurnDTO[] }
  | { t: 'message'; message: MessageDTO }
  | { t: 'message.update'; message: MessageDTO; streaming?: boolean }
  | { t: 'thread.created'; messageId: string; threadId: string }
  | { t: 'message.delete'; id: string }
  | { t: 'typing'; userId: string; active: boolean }
  | { t: 'agent.state'; agentId: string; runs: AgentTurnDTO[] }
  | { t: 'presence'; users: Array<{ userId: string; status: PresenceStatus }> }
  | { t: 'huddle'; huddle: HuddleState }
  | { t: 'voice'; voice: HuddleState }
  | { t: 'dm.participants'; participants: PublicUser[] }
  | { t: 'dm.update'; name: string | null }
  | { t: 'reaction'; messageId: string; emoji: string; userId: string; op: 'add' | 'remove' }
  | { t: 'pin'; messageId: string; pin: MessagePinDTO | null }
  | { t: 'read.ack'; channelId: string; messageId: string; unread: boolean }
  | { t: 'error'; code: string; message: string; clientId?: string }
  | { t: 'ack'; clientId: string; id: string }

export type WorkspaceClientMsg = { t: 'auth'; token: string; visible?: boolean } | { t: 'activity'; visible?: boolean }

export type WorkspaceServerMsg =
  | { t: 'hello'; workspaceId: string }
  | { t: 'presence'; users: Array<{ userId: string; status: PresenceStatus }> }
  | { t: 'error'; code: string; message: string }
