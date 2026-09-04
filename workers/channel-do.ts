import { DurableObject } from 'cloudflare:workers'
import { z } from 'zod'
import type { AttachmentDTO, HuddleState, MessageDTO, PublicUser, ServerMsg } from '../shared/types'
import { extractMentionIds } from '../shared/mentions'
import { isDmType, isVoiceType } from '../shared/dm'
import { ALL_PERMISSIONS, hasPermission, MemberPermissions, Permission } from '../shared/permissions'
import { resolveChannelPermissions } from '../shared/channel-permissions'
import { newId, nowIso, WORKSPACE_ID } from '../shared/ids'
import { asRpc, type DiscoflareEnv } from './env'
import { createMeeting, endMeeting, loadRealtimeKitConfig, realtimekitConfigured } from './realtimekit'
import { userFromTicket } from './ticket'
import { channelHasUnread } from './unread'
import { huddleNotificationStatement, messageNotificationStatement, signalNotificationOutbox } from './notifications'
import { signalChannelActivity, signalChannelRead } from './channel-activity'
import { signalAgentsForMessage } from './agent-ingress'
import { listAgentTurns } from './agent-turns'
import { AGENT_REACTION_EMOJIS, replaceAgentReaction } from './agent-reactions'

type Sock = { userId: string; user: PublicUser }
type Authz = { workspaceId: string; perms: number; ownerId: string; type: string; frozen: boolean; canManageAgents: boolean }

const createSchema = z.object({
  t: z.literal('message.create'),
  content: z.string().max(2000),
  replyToId: z.string().min(8).optional(),
  clientId: z.string().min(1).max(80),
  attachmentIds: z.array(z.string().min(8)).max(8).optional(),
  agentMode: z.enum(['queue', 'steer']).optional(),
})

const agentControlSchema = z.object({
  t: z.literal('agent.control'),
  agentId: z.string().min(8),
  action: z.enum(['stop', 'approve', 'reject']),
  executionId: z.string().min(1).optional(),
})

const updateSchema = z.object({
  t: z.literal('message.update'),
  id: z.string().min(8),
  content: z.string().min(1).max(2000),
})

const agentPostSchema = z.object({
  agentId: z.string().min(8),
  content: z.string().trim().min(1).max(2000),
})

const agentUpdateSchema = agentPostSchema.extend({
  messageId: z.string().min(8),
})

const agentReactionSchema = z.object({
  agentId: z.string().min(8),
  messageId: z.string().min(8),
  emoji: z.enum(AGENT_REACTION_EMOJIS),
})

const emptyHuddle = (): HuddleState => ({
  active: false,
  huddleId: null,
  meetingId: null,
  participantIds: [],
  startedBy: null,
  startedAt: null,
})

export class ChannelDurableObject extends DurableObject<DiscoflareEnv> {
  constructor(ctx: DurableObjectState, env: DiscoflareEnv) {
    super(ctx, env)
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 })
    }
    const url = new URL(request.url)
    const parts = url.pathname.split('/')
    const channelId = parts[parts.length - 1] || this.channelId()
    await this.ctx.storage.put('channelId', channelId)

    const pair = new WebSocketPair()
    this.ctx.acceptWebSocket(pair[1])
    this.ctx.waitUntil(this.authTimeout(pair[1]))
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string') return
    let msg: { t?: string; token?: string; clientId?: string }
    try {
      msg = JSON.parse(raw) as { t?: string; token?: string; clientId?: string }
    }
    catch {
      this.send(ws, { t: 'error', code: 'bad_json', message: 'Invalid JSON' })
      return
    }

    const sock = ws.deserializeAttachment() as Sock | null
    if (msg.t === 'auth' && typeof msg.token === 'string') {
      const user = await userFromTicket(this.env, msg.token)
      if (!user) {
        this.send(ws, { t: 'error', code: 'unauthorized', message: 'Invalid session' })
        ws.close(4001, 'unauthorized')
        return
      }
      await this.hello(ws, user)
      return
    }
    if (!sock?.userId) {
      this.send(ws, { t: 'error', code: 'unauthorized', message: 'Auth required' })
      return
    }

    try {
      await this.handle(ws, sock, raw)
    }
    catch (err) {
      const message = err instanceof Error ? err.message : 'error'
      this.send(ws, {
        t: 'error',
        code: 'internal',
        message,
        ...(msg.t === 'message.create' && msg.clientId ? { clientId: msg.clientId } : {}),
      })
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    const sock = ws.deserializeAttachment() as Sock | null
    if (!sock?.userId) return
    const huddle = await this.getHuddle()
    if (huddle.active && huddle.participantIds.includes(sock.userId)) {
      huddle.participantIds = huddle.participantIds.filter((id) => id !== sock.userId)
      await this.setHuddle(huddle)
      this.broadcast({ t: 'huddle', huddle })
      this.broadcast({ t: 'voice', voice: huddle })
      if (huddle.participantIds.length === 0) {
        await this.ctx.storage.setAlarm(Date.now() + 30_000)
      }
    }
  }

  override async alarm(): Promise<void> {
    const huddle = await this.getHuddle()
    if (huddle.active && huddle.participantIds.length === 0) {
      if (huddle.meetingId) await endMeeting(await loadRealtimeKitConfig(this.env), huddle.meetingId)
      await this.setHuddle(emptyHuddle())
      await this.env.DB.prepare('UPDATE channels SET huddle_meeting_id = NULL WHERE id = ?').bind(this.channelId()).run()
      this.broadcast({ t: 'huddle', huddle: emptyHuddle() })
    }
  }

  async fanout(msg: ServerMsg): Promise<void> {
    if (msg.t === 'agent.state') {
      for (const ws of this.ctx.getWebSockets()) {
        const sock = ws.deserializeAttachment() as Sock | null
        if (!sock?.userId) continue
        const authz = await this.loadAuthz(sock.userId)
        if (authz?.canManageAgents) this.send(ws, msg)
      }
      return
    }
    this.broadcast(msg)
  }

  async postAgentMessage(input: z.infer<typeof agentPostSchema>): Promise<{ id: string, channelId: string }> {
    const body = agentPostSchema.parse(input)
    const agent = await this.env.DB.prepare(
      `SELECT u.id, u.kind, u.display_name as displayName, u.avatar_r2_key as avatarR2Key
       FROM users u JOIN agents a ON a.user_id = u.id
       WHERE u.id = ? AND u.kind = 'agent' AND u.status = 'active' AND a.status = 'active'`,
    ).bind(body.agentId).first<{
      id: string
      kind: 'agent'
      displayName: string
      avatarR2Key: string | null
    }>()
    if (!agent) throw new Error('Agent is unavailable')

    const channel = await this.env.DB.prepare(
      'SELECT id, type, visibility, parent_id as parentId FROM channels WHERE id = ?',
    ).bind(this.channelId()).first<{ id: string; type: string; visibility: string; parentId: string | null }>()
    if (!channel) throw new Error('Channel not found')
    if (channel.visibility === 'private') {
      const accessChannelId = channel.type === 'thread' && channel.parentId ? channel.parentId : channel.id
      const access = await this.env.DB.prepare(
        'SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?',
      ).bind(accessChannelId, agent.id).first()
      if (!access) throw new Error('Agent cannot access this private channel')
    }

    const id = newId()
    const createdAt = nowIso()
    const message: MessageDTO = {
      id,
      channelId: channel.id,
      workspaceId: WORKSPACE_ID,
      author: agent,
      content: body.content,
      replyTo: null,
      mentions: [],
      attachments: [],
      reactions: [],
      pin: null,
      threadId: null,
      editedAt: null,
      deletedAt: null,
      createdAt,
    }
    await this.persistMessage(message, null)
    this.ctx.waitUntil(signalNotificationOutbox(this.env))
    this.ctx.waitUntil(signalChannelActivity(this.env, {
      id,
      channelId: channel.id,
      author: agent,
      content: body.content,
      attachmentCount: 0,
    }))
    this.broadcast({ t: 'message', message })
    return { id, channelId: channel.id }
  }

  async updateAgentMessage(input: z.infer<typeof agentUpdateSchema>): Promise<void> {
    const body = agentUpdateSchema.parse(input)
    const row = await this.env.DB.prepare(
      `SELECT m.id
       FROM messages m
       JOIN users u ON u.id = m.author_id
       JOIN agents a ON a.user_id = u.id
       WHERE m.id = ? AND m.channel_id = ? AND m.author_id = ?
         AND m.deleted_at IS NULL AND u.kind = 'agent'`,
    ).bind(body.messageId, this.channelId(), body.agentId).first<{ id: string }>()
    if (!row) throw new Error('Agent message not found')
    await this.env.DB.prepare('UPDATE messages SET content = ? WHERE id = ?').bind(body.content, body.messageId).run()
    const message = await this.loadMessage(body.messageId)
    if (message) this.broadcast({ t: 'message.update', message, streaming: true })
  }

  async setAgentReaction(input: z.infer<typeof agentReactionSchema>): Promise<void> {
    const body = agentReactionSchema.parse(input)
    const target = await this.env.DB.prepare(
      `SELECT m.id
       FROM messages m
       JOIN users u ON u.id = ?
       JOIN agents a ON a.user_id = u.id
       WHERE m.id = ? AND m.channel_id = ?
         AND u.kind = 'agent' AND u.status = 'active' AND a.status = 'active'`,
    ).bind(body.agentId, body.messageId, this.channelId()).first<{ id: string }>()
    if (!target) throw new Error('Agent reaction target not found')

    const change = await replaceAgentReaction(this.env.DB, body.messageId, body.agentId, body.emoji)
    for (const emoji of change.removed) {
      this.broadcast({ t: 'reaction', messageId: body.messageId, emoji, userId: body.agentId, op: 'remove' })
    }
    if (change.added) {
      this.broadcast({ t: 'reaction', messageId: body.messageId, emoji: change.added, userId: body.agentId, op: 'add' })
    }
  }

  async getHuddle(): Promise<HuddleState> {
    return (await this.ctx.storage.get<HuddleState>('huddle')) ?? emptyHuddle()
  }

  private async handle(ws: WebSocket, sock: Sock, raw: string) {
    const parsed = JSON.parse(raw) as { t: string }
    const authz = await this.loadAuthz(sock.userId)
    if (!authz) {
      this.send(ws, { t: 'error', code: 'not_found', message: 'Channel not found' })
      return
    }

    switch (parsed.t) {
      case 'message.create':
        await this.onCreate(ws, sock, authz, createSchema.parse(JSON.parse(raw)))
        break
      case 'message.update':
        await this.onUpdate(ws, sock, updateSchema.parse(JSON.parse(raw)))
        break
      case 'message.delete':
        await this.onDelete(ws, sock, (JSON.parse(raw) as { id: string }).id)
        break
      case 'agent.control':
        await this.onAgentControl(ws, sock, authz, agentControlSchema.parse(JSON.parse(raw)))
        break
      case 'typing':
        this.broadcast({
          t: 'typing',
          userId: sock.userId,
          active: (JSON.parse(raw) as { active?: boolean }).active !== false,
        }, ws)
        break
      case 'read':
        await this.onRead(sock, authz, (JSON.parse(raw) as { messageId: string }).messageId)
        break
      case 'huddle.start':
      case 'voice.join':
        await this.onHuddleStart(ws, sock, authz)
        break
      case 'huddle.join':
        await this.onHuddleJoin(ws, sock, authz)
        break
      case 'huddle.leave':
      case 'voice.leave':
        await this.onHuddleLeave(sock)
        break
      default:
        this.send(ws, { t: 'error', code: 'unknown', message: `Unknown type ${parsed.t}` })
    }
  }

  private async onCreate(
    ws: WebSocket,
    sock: Sock,
    authz: Authz,
    body: z.infer<typeof createSchema>,
  ) {
    const fail = (code: string, message: string) => this.send(ws, {
      t: 'error',
      code,
      message,
      clientId: body.clientId,
    })
    if (authz.frozen) {
      fail('frozen', 'You can no longer send messages to this user')
      return
    }
    if (!hasPermission(authz.perms, Permission.sendMessages)) {
      fail('forbidden', 'Cannot send messages in this channel')
      return
    }
    if (body.attachmentIds?.length && !hasPermission(authz.perms, Permission.attachFiles)) {
      fail('forbidden', 'Cannot attach files in this channel')
      return
    }
    if (!body.content.trim() && !(body.attachmentIds?.length)) {
      fail('bad_request', 'Empty message')
      return
    }
    const limiter = asRpc<{ take: (n: number, w: number) => Promise<boolean> }>(this.env.RATE_LIMIT_DO.getByName(`user:${sock.userId}:msg`))
    const ok = await limiter.take(30, 10_000)
    if (!ok) {
      fail('rate_limited', 'Slow down')
      return
    }

    const idemKey = `${sock.userId}:${body.clientId}`
    const existing = await this.ctx.storage.get<string>(`idem:${idemKey}`)
    if (existing) {
      this.send(ws, { t: 'ack', clientId: body.clientId, id: existing })
      return
    }

    const id = newId()
    const createdAt = nowIso()
    const mentions = await this.validMentions(extractMentionIds(body.content))
    const attachmentIds = [...new Set(body.attachmentIds ?? [])]
    if (attachmentIds.length !== (body.attachmentIds?.length ?? 0)) {
      fail('bad_request', 'Duplicate attachment')
      return
    }
    const attachments = await this.loadAttachments(sock.userId, attachmentIds)
    if (attachments.length !== attachmentIds.length) {
      fail('bad_request', 'Invalid attachment')
      return
    }
    let replyTo: MessageDTO['replyTo'] = null
    if (body.replyToId) {
      const row = await this.env.DB.prepare(
        `SELECT id, author_id, content, deleted_at,
          (SELECT COUNT(*) FROM attachments WHERE message_id = messages.id) AS attachment_count
         FROM messages WHERE id = ? AND channel_id = ?`,
      ).bind(body.replyToId, this.channelId()).first<{
        id: string
        author_id: string
        content: string
        deleted_at: string | null
        attachment_count: number
      }>()
      if (!row) {
        fail('bad_request', 'Invalid reply target')
        return
      }
      replyTo = {
        id: row.id,
        authorId: row.author_id,
        content: row.deleted_at ? '' : row.content.slice(0, 180),
        attachmentCount: row.attachment_count,
        deleted: Boolean(row.deleted_at),
      }
    }

    const dto: MessageDTO = {
      id,
      channelId: this.channelId(),
      workspaceId: authz.workspaceId,
      author: sock.user,
      content: body.content,
      replyTo,
      mentions,
      attachments,
      reactions: [],
      pin: null,
      threadId: null,
      editedAt: null,
      deletedAt: null,
      createdAt,
      clientId: body.clientId,
    }

    await this.persistMessage(dto, body.replyToId ?? null)
    this.ctx.waitUntil(signalNotificationOutbox(this.env))
    this.ctx.waitUntil(signalChannelActivity(this.env, {
      id,
      channelId: this.channelId(),
      author: sock.user,
      content: body.content,
      attachmentCount: attachments.length,
    }))
    this.ctx.waitUntil(signalChannelRead(this.env, sock.userId, this.channelId(), id))
    await this.ctx.storage.put(`idem:${idemKey}`, id)
    this.broadcast({ t: 'message', message: dto })
    this.send(ws, { t: 'ack', clientId: body.clientId, id })
    this.ctx.waitUntil(signalAgentsForMessage(this.env, {
      messageId: id,
      channelId: this.channelId(),
      authorId: sock.userId,
      authorName: sock.user.displayName,
      content: body.content,
      mentionIds: mentions,
      mode: body.agentMode,
    }))
  }

  private async onAgentControl(
    ws: WebSocket,
    _sock: Sock,
    authz: Authz,
    body: z.infer<typeof agentControlSchema>,
  ) {
    if (!authz.canManageAgents) {
      this.send(ws, { t: 'error', code: 'forbidden', message: 'Cannot control an Agent in this channel' })
      return
    }
    const turn = await this.env.DB.prepare(
      `SELECT submission_id FROM agent_turns
       WHERE channel_id = ? AND agent_id = ?
         AND (? IS NULL OR approval_json LIKE ?)
       LIMIT 1`,
    ).bind(this.channelId(), body.agentId, body.executionId ?? null, body.executionId ? `%${body.executionId}%` : null).first()
    if (!turn) {
      this.send(ws, { t: 'error', code: 'not_found', message: 'Agent run not found' })
      return
    }
    const agent = asRpc<{
      controlConversation: (input: { channelId: string; action: 'stop' | 'approve' | 'reject'; executionId?: string }) => Promise<void>
    }>(this.env.AGENT_DO.getByName(`agent:${body.agentId}`))
    await agent.controlConversation({ channelId: this.channelId(), action: body.action, executionId: body.executionId })
  }

  private async onUpdate(ws: WebSocket, sock: Sock, body: z.infer<typeof updateSchema>) {
    const row = await this.env.DB.prepare(
      'SELECT id, author_id, channel_id, content, reply_to_id, created_at, deleted_at FROM messages WHERE id = ?',
    ).bind(body.id).first<{
      id: string
      author_id: string
      channel_id: string
      content: string
      reply_to_id: string | null
      created_at: string
      deleted_at: string | null
    }>()
    if (!row || row.channel_id !== this.channelId()) {
      this.send(ws, { t: 'error', code: 'not_found', message: 'Message not found' })
      return
    }
    if (row.author_id !== sock.userId) {
      this.send(ws, { t: 'error', code: 'forbidden', message: 'Not your message' })
      return
    }
    if (row.deleted_at) return
    const editedAt = nowIso()
    const mentions = await this.validMentions(extractMentionIds(body.content))
    await this.env.DB.batch([
      this.env.DB.prepare('UPDATE messages SET content = ?, edited_at = ? WHERE id = ?').bind(body.content, editedAt, body.id),
      this.env.DB.prepare('DELETE FROM message_mentions WHERE message_id = ?').bind(body.id),
      ...mentions.map((userId) => this.env.DB.prepare(
        'INSERT OR IGNORE INTO message_mentions (message_id, user_id) VALUES (?, ?)',
      ).bind(body.id, userId)),
    ])
    const dto = await this.loadMessage(body.id)
    if (dto) this.broadcast({ t: 'message.update', message: dto })
  }

  private async onDelete(ws: WebSocket, sock: Sock, id: string) {
    const row = await this.env.DB.prepare(
      'SELECT author_id, channel_id FROM messages WHERE id = ?',
    ).bind(id).first<{ author_id: string; channel_id: string }>()
    if (!row || row.channel_id !== this.channelId()) {
      this.send(ws, { t: 'error', code: 'not_found', message: 'Message not found' })
      return
    }
    if (row.author_id !== sock.userId) {
      this.send(ws, { t: 'error', code: 'forbidden', message: 'Not your message' })
      return
    }
    const deletedAt = nowIso()
    const pin = await this.env.DB.prepare('SELECT message_id FROM message_pins WHERE message_id = ?').bind(id).first()
    await this.env.DB.batch([
      this.env.DB.prepare('UPDATE messages SET deleted_at = ?, content = ? WHERE id = ?').bind(deletedAt, '', id),
      this.env.DB.prepare('DELETE FROM message_pins WHERE message_id = ?').bind(id),
    ])
    this.broadcast({ t: 'message.delete', id })
    if (pin) this.broadcast({ t: 'pin', messageId: id, pin: null })
  }

  private async onRead(sock: Sock, _authz: Authz, messageId: string) {
    const message = await this.env.DB.prepare(
      'SELECT id FROM messages WHERE id = ? AND channel_id = ?',
    ).bind(messageId, this.channelId()).first<{ id: string }>()
    if (!message) return
    await this.env.DB.prepare(
      `INSERT INTO channel_reads (channel_id, user_id, last_read_message_id, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(channel_id, user_id) DO UPDATE
       SET last_read_message_id = excluded.last_read_message_id, updated_at = excluded.updated_at
       WHERE channel_reads.last_read_message_id IS NULL
          OR channel_reads.last_read_message_id < excluded.last_read_message_id`,
    ).bind(this.channelId(), sock.userId, messageId, nowIso()).run()
    const state = await this.env.DB.prepare(
      `SELECT last_read_message_id
       FROM channel_reads
       WHERE channel_id = ? AND user_id = ?`,
    ).bind(this.channelId(), sock.userId).first<{
      last_read_message_id: string | null
    }>()
    const cursor = state?.last_read_message_id ?? messageId
    this.sendToUser(sock.userId, {
      t: 'read.ack',
      channelId: this.channelId(),
      messageId: cursor,
      unread: await channelHasUnread(this.env.DB, sock.userId, this.channelId()),
    })
    this.ctx.waitUntil(signalChannelRead(this.env, sock.userId, this.channelId(), cursor))
  }

  private async onHuddleStart(ws: WebSocket, sock: Sock, authz: Authz) {
    if (!isVoiceType(authz.type) && !isDmType(authz.type)) {
      this.send(ws, { t: 'error', code: 'forbidden', message: 'Huddles are for voice channels and DMs' })
      return
    }
    if (!isDmType(authz.type) && !hasPermission(authz.perms, Permission.startHuddle)) {
      this.send(ws, { t: 'error', code: 'forbidden', message: 'Cannot start huddle' })
      return
    }
    const realtimekit = await loadRealtimeKitConfig(this.env)
    if (!realtimekitConfigured(realtimekit)) {
      this.send(ws, { t: 'error', code: 'realtimekit_unconfigured', message: 'RealtimeKit secrets missing' })
      return
    }
    const limiter = asRpc<{ take: (n: number, w: number) => Promise<boolean> }>(this.env.RATE_LIMIT_DO.getByName(`user:${sock.userId}:huddle`))
    const ok = await limiter.take(10, 60 * 60 * 1000)
    if (!ok) {
      this.send(ws, { t: 'error', code: 'rate_limited', message: 'Huddle start limit' })
      return
    }
    let huddle = await this.getHuddle()
    if (huddle.active && huddle.meetingId) {
      if (!huddle.participantIds.includes(sock.userId)) huddle.participantIds.push(sock.userId)
      await this.setHuddle(huddle)
      this.broadcast({ t: 'huddle', huddle })
      this.broadcast({ t: 'voice', voice: huddle })
      return
    }
    const meeting = await createMeeting(realtimekit, `huddle:${this.channelId()}`)
    huddle = {
      active: true,
      huddleId: meeting.id,
      meetingId: meeting.id,
      participantIds: [sock.userId],
      startedBy: sock.userId,
      startedAt: nowIso(),
    }
    await this.setHuddle(huddle)
    const notification = await huddleNotificationStatement(this.env, this.channelId(), meeting.id, sock.user)
    await this.env.DB.batch([
      this.env.DB.prepare('UPDATE channels SET huddle_meeting_id = ? WHERE id = ?').bind(meeting.id, this.channelId()),
      this.env.DB.prepare(
        'INSERT INTO audit_log (id, actor_id, action, target_type, target_id, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).bind(newId(), sock.userId, 'huddle.start', 'channel', this.channelId(), '{}', nowIso()),
      ...(notification ? [notification] : []),
    ])
    this.ctx.waitUntil(signalNotificationOutbox(this.env))
    this.broadcast({ t: 'huddle', huddle })
    this.broadcast({ t: 'voice', voice: huddle })
  }

  private async onHuddleJoin(ws: WebSocket, sock: Sock, _authz: Authz) {
    const huddle = await this.getHuddle()
    if (!huddle.active) {
      this.send(ws, { t: 'error', code: 'not_found', message: 'No active huddle' })
      return
    }
    if (!huddle.participantIds.includes(sock.userId)) huddle.participantIds.push(sock.userId)
    await this.setHuddle(huddle)
    this.broadcast({ t: 'huddle', huddle })
    this.broadcast({ t: 'voice', voice: huddle })
  }

  private async onHuddleLeave(sock: Sock) {
    const huddle = await this.getHuddle()
    huddle.participantIds = huddle.participantIds.filter((id) => id !== sock.userId)
    await this.setHuddle(huddle)
    this.broadcast({ t: 'huddle', huddle })
    this.broadcast({ t: 'voice', voice: huddle })
    if (huddle.participantIds.length === 0) {
      const ms = isDmType((await this.loadAuthz(sock.userId))?.type ?? '') ? 30_000 : 30 * 60 * 1000
      await this.ctx.storage.setAlarm(Date.now() + ms)
    }
  }

  private async hello(ws: WebSocket, user: PublicUser) {
    const authz = await this.loadAuthz(user.id)
    if (!authz) {
      this.send(ws, { t: 'error', code: 'not_found', message: 'Channel not found' })
      ws.close(4404, 'not_found')
      return
    }
    ws.serializeAttachment({ userId: user.id, user } satisfies Sock)
    const huddle = await this.getHuddle()
    let participants: PublicUser[] | undefined
    if (isDmType(authz.type) || (authz.type === 'thread')) {
      participants = await this.loadDmParticipants()
    }
    const agentTurns = authz.canManageAgents ? await listAgentTurns(this.env, this.channelId()) : []
    this.send(ws, { t: 'hello', channelId: this.channelId(), you: user, huddle, frozen: authz.frozen, participants, agentTurns })
  }

  private async authTimeout(ws: WebSocket) {
    await new Promise((r) => setTimeout(r, 2000))
    const sock = ws.deserializeAttachment() as Sock | null
    if (!sock?.userId) {
      try { ws.close(4001, 'unauthorized') }
      catch { /* closed */ }
    }
  }

  private async loadAuthz(userId: string): Promise<Authz | null> {
    const ch = await this.env.DB.prepare(
      'SELECT id, type, visibility, parent_id FROM channels WHERE id = ?',
    ).bind(this.channelId()).first<{ id: string; type: string; visibility: string; parent_id: string | null }>()
    if (!ch) return null
    const type = ch.type
    let accessRoot = ch
    if (type === 'thread' && ch.parent_id) {
      const parent = await this.env.DB.prepare('SELECT id, type, visibility, parent_id FROM channels WHERE id = ?').bind(ch.parent_id).first<{ id: string; type: string; visibility: string; parent_id: string | null }>()
      if (!parent) return null
      accessRoot = parent
    }

    const membership = await this.env.DB.prepare(
      `SELECT r.permissions_bitmask as perms, r.id as roleId, w.owner_id as ownerId
       FROM users u
       JOIN roles r ON r.id = u.role_id
       JOIN workspace w ON w.id = 'main'
       WHERE u.id = ? AND u.status = 'active'`,
    ).bind(userId).first<{ perms: number; roleId: string; ownerId: string }>()
    if (!membership) return null
    const canManageAgents = membership.ownerId === userId || hasPermission(membership.perms, Permission.manageWorkspace)

    if (accessRoot.visibility === 'private') {
      const part = await this.env.DB.prepare(
        'SELECT user_id FROM channel_members WHERE channel_id = ? AND user_id = ?',
      ).bind(accessRoot.id, userId).first()
      if (!part) return null
    }

    if (isDmType(accessRoot.type)) {
      const parts = await this.env.DB.prepare('SELECT user_id FROM channel_members WHERE channel_id = ?').bind(accessRoot.id).all<{ user_id: string }>()
      const ids = (parts.results ?? []).map((p) => p.user_id)
      let frozen = false
      if (ids.length) {
        const placeholders = ids.map(() => '?').join(',')
        if (!canManageAgents) {
          const agent = await this.env.DB.prepare(
            `SELECT 1 FROM users WHERE id IN (${placeholders}) AND kind = 'agent' LIMIT 1`,
          ).bind(...ids).first()
          if (agent) return null
        }
        const still = await this.env.DB.prepare(
          `SELECT id FROM users WHERE id IN (${placeholders}) AND status = 'active'`,
        ).bind(...ids).all<{ id: string }>()
        frozen = (still.results ?? []).length !== ids.length
      }
      const perms = frozen ? 0 : (MemberPermissions | Permission.startHuddle)
      return { workspaceId: WORKSPACE_ID, type: accessRoot.id === ch.id ? 'dm' : type, perms, ownerId: membership.ownerId, frozen, canManageAgents }
    }
    let perms = membership.ownerId === userId ? ALL_PERMISSIONS : membership.perms
    if (membership.ownerId !== userId) {
      const override = await this.env.DB.prepare(
        'SELECT allow_mask, deny_mask FROM channel_role_overrides WHERE channel_id = ? AND role_id = ?',
      ).bind(accessRoot.id, membership.roleId).first<{ allow_mask: number; deny_mask: number }>()
      perms = resolveChannelPermissions(perms, override && { allow: override.allow_mask, deny: override.deny_mask })
    }
    return { workspaceId: WORKSPACE_ID, type, perms, ownerId: membership.ownerId, frozen: false, canManageAgents }
  }

  private async loadDmParticipants(): Promise<PublicUser[]> {
    const ch = await this.env.DB.prepare('SELECT id, type, parent_id FROM channels WHERE id = ?').bind(this.channelId()).first<{ id: string; type: string; parent_id: string | null }>()
    if (!ch) return []
    const dmId = isDmType(ch.type) ? ch.id : ch.parent_id
    if (!dmId) return []
    const rows = await this.env.DB.prepare(
      `SELECT u.id, u.kind, u.display_name, u.avatar_r2_key
       FROM channel_members p JOIN users u ON u.id = p.user_id WHERE p.channel_id = ?`,
    ).bind(dmId).all<{ id: string; kind: 'human' | 'agent'; display_name: string; avatar_r2_key: string | null }>()
    return (rows.results ?? []).map((r) => ({ id: r.id, kind: r.kind, displayName: r.display_name, avatarR2Key: r.avatar_r2_key }))
  }

  private async persistMessage(dto: MessageDTO, replyToId: string | null) {
    const notification = await messageNotificationStatement(this.env, {
      id: dto.id,
      channelId: dto.channelId,
      author: dto.author,
      content: dto.content,
      mentions: dto.mentions,
      attachmentCount: dto.attachments.length,
    })
    const statements = [
      this.env.DB.prepare(
        'INSERT INTO messages (id, channel_id, author_id, content, reply_to_id, edited_at, deleted_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)',
      ).bind(dto.id, dto.channelId, dto.author.id, dto.content, replyToId, dto.createdAt),
      ...dto.attachments.map((attachment) => this.env.DB.prepare(
        'UPDATE attachments SET message_id = ? WHERE id = ? AND message_id IS NULL AND channel_id = ? AND uploader_id = ?',
      ).bind(dto.id, attachment.id, dto.channelId, dto.author.id)),
      ...dto.mentions.map((uid) => this.env.DB.prepare(
        'INSERT OR IGNORE INTO message_mentions (message_id, user_id) VALUES (?, ?)',
      ).bind(dto.id, uid)),
      this.env.DB.prepare(
        `INSERT INTO channel_reads (channel_id, user_id, last_read_message_id, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(channel_id, user_id) DO UPDATE
         SET last_read_message_id = excluded.last_read_message_id, updated_at = excluded.updated_at
         WHERE channel_reads.last_read_message_id IS NULL
            OR channel_reads.last_read_message_id < excluded.last_read_message_id`,
      ).bind(dto.channelId, dto.author.id, dto.id, dto.createdAt),
      ...(notification ? [notification] : []),
    ]
    await this.env.DB.batch(statements)
  }

  private async loadAttachments(userId: string, ids: string[]): Promise<AttachmentDTO[]> {
    if (!ids.length) return []
    const out: AttachmentDTO[] = []
    for (const id of ids) {
      const row = await this.env.DB.prepare(
        'SELECT id, r2_key, filename, content_type, size_bytes, width, height FROM attachments WHERE id = ? AND message_id IS NULL AND channel_id = ? AND uploader_id = ?',
      ).bind(id, this.channelId(), userId).first<{
        id: string
        r2_key: string
        filename: string
        content_type: string
        size_bytes: number
        width: number | null
        height: number | null
      }>()
      if (!row) continue
      out.push({
        id: row.id,
        filename: row.filename,
        contentType: row.content_type,
        sizeBytes: row.size_bytes,
        width: row.width,
        height: row.height,
        url: `/api/files/${row.id}`,
      })
    }
    return out
  }

  private async validMentions(ids: string[]): Promise<string[]> {
    if (!ids.length) return []
    const placeholders = ids.map(() => '?').join(',')
    const rows = await this.env.DB.prepare(
      `SELECT id FROM users WHERE id IN (${placeholders}) AND status = 'active'`,
    ).bind(...ids).all<{ id: string }>()
    return (rows.results ?? []).map((row) => row.id)
  }

  private async loadMessage(id: string): Promise<MessageDTO | null> {
    const row = await this.env.DB.prepare(
      `SELECT m.id, m.channel_id, m.content, m.reply_to_id, m.edited_at, m.deleted_at, m.created_at,
              u.id as uid, u.kind, u.display_name, u.avatar_r2_key
       FROM messages m JOIN users u ON u.id = m.author_id WHERE m.id = ?`,
    ).bind(id).first<{
      id: string
      channel_id: string
      content: string
      reply_to_id: string | null
      edited_at: string | null
      deleted_at: string | null
      created_at: string
      uid: string
      kind: 'human' | 'agent'
      display_name: string
      avatar_r2_key: string | null
    }>()
    if (!row) return null
    const mentionRows = await this.env.DB.prepare('SELECT user_id FROM message_mentions WHERE message_id = ?').bind(id).all<{ user_id: string }>()
    const attRows = await this.env.DB.prepare(
      'SELECT id, r2_key, filename, content_type, size_bytes, width, height FROM attachments WHERE message_id = ?',
    ).bind(id).all<{
      id: string
      r2_key: string
      filename: string
      content_type: string
      size_bytes: number
      width: number | null
      height: number | null
    }>()
    const pin = await this.env.DB.prepare(
      `SELECT p.pinned_at, u.id, u.kind, u.display_name, u.avatar_r2_key
       FROM message_pins p JOIN users u ON u.id = p.pinned_by
       WHERE p.message_id = ?`,
    ).bind(id).first<{
      pinned_at: string
      id: string
      kind: 'human' | 'agent'
      display_name: string
      avatar_r2_key: string | null
    }>()
    return {
      id: row.id,
      channelId: row.channel_id,
      workspaceId: WORKSPACE_ID,
      author: { id: row.uid, kind: row.kind, displayName: row.display_name, avatarR2Key: row.avatar_r2_key },
      content: row.deleted_at ? '' : row.content,
      replyTo: null,
      mentions: (mentionRows.results ?? []).map((r) => r.user_id),
      attachments: (attRows.results ?? []).map((a) => ({
        id: a.id,
        filename: a.filename,
        contentType: a.content_type,
        sizeBytes: a.size_bytes,
        width: a.width,
        height: a.height,
        url: `/api/files/${a.id}`,
      })),
      reactions: [],
      pin: pin
        ? {
            pinnedBy: { id: pin.id, kind: pin.kind, displayName: pin.display_name, avatarR2Key: pin.avatar_r2_key },
            pinnedAt: pin.pinned_at,
          }
        : null,
      threadId: null,
      editedAt: row.edited_at,
      deletedAt: row.deleted_at,
      createdAt: row.created_at,
    }
  }

  private async setHuddle(huddle: HuddleState) {
    await this.ctx.storage.put('huddle', huddle)
  }

  private channelId(): string {
    return (this.ctx.id.name ?? '').replace(/^channel:/, '')
  }

  private broadcast(msg: ServerMsg, except?: WebSocket) {
    const payload = JSON.stringify(msg)
    for (const ws of this.ctx.getWebSockets()) {
      if (except && ws === except) continue
      try { ws.send(payload) }
      catch { /* ignore */ }
    }
  }

  private sendToUser(userId: string, msg: ServerMsg) {
    const payload = JSON.stringify(msg)
    for (const ws of this.ctx.getWebSockets()) {
      const sock = ws.deserializeAttachment() as Sock | null
      if (sock?.userId !== userId) continue
      try { ws.send(payload) }
      catch { /* ignore */ }
    }
  }

  private send(ws: WebSocket, msg: ServerMsg) {
    try { ws.send(JSON.stringify(msg)) }
    catch { /* ignore */ }
  }
}
