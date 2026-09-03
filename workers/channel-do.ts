import { DurableObject } from 'cloudflare:workers'
import { z } from 'zod'
import type { AttachmentDTO, HuddleState, MessageDTO, PublicUser, ServerMsg } from '../shared/types'
import { extractMentionIds } from '../shared/mentions'
import { isDmType, isVoiceType, normalizeChannelType } from '../shared/dm'
import { ALL_PERMISSIONS, hasPermission, MemberPermissions, Permission } from '../shared/permissions'
import { newId, nowIso } from '../shared/ids'
import { asRpc, readCookie, SESSION_COOKIE, type DiscoflareEnv } from './env'
import { createMeeting, endMeeting, realtimekitConfigured } from './realtimekit'
import { userFromSession } from './session'

type Sock = { userId: string; user: PublicUser }
type Authz = { guildId: string; perms: number; ownerId: string; type: string; frozen: boolean }

const createSchema = z.object({
  t: z.literal('message.create'),
  content: z.string().max(2000),
  replyToId: z.string().min(8).optional(),
  clientId: z.string().min(1).max(80),
  attachmentIds: z.array(z.string().min(8)).max(8).optional(),
})

const updateSchema = z.object({
  t: z.literal('message.update'),
  id: z.string().min(8),
  content: z.string().min(1).max(2000),
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
    const token = readCookie(request.headers.get('Cookie'), SESSION_COOKIE)
    if (token) {
      const user = await userFromSession(this.env, token)
      if (user) await this.hello(pair[1], user)
    }
    this.ctx.waitUntil(this.authTimeout(pair[1]))
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string') return
    let msg: { t?: string; token?: string }
    try {
      msg = JSON.parse(raw) as { t?: string; token?: string }
    }
    catch {
      this.send(ws, { t: 'error', code: 'bad_json', message: 'Invalid JSON' })
      return
    }

    const sock = ws.deserializeAttachment() as Sock | null
    if (msg.t === 'auth' && typeof msg.token === 'string') {
      const user = await userFromSession(this.env, msg.token)
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
      this.send(ws, { t: 'error', code: 'internal', message })
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
    const guildId = (await this.loadAuthz(sock.userId))?.guildId
    if (guildId) {
      this.ctx.waitUntil(
        this.env.GUILD_DO.getByName(`guild:${guildId}`).fetch(
          new Request('https://do/disconnect', {
            method: 'POST',
            body: JSON.stringify({ userId: sock.userId }),
          }),
        ).catch(() => this.notifyGuild(guildId, 'disconnect', sock.userId)),
      )
    }
  }

  override async alarm(): Promise<void> {
    const huddle = await this.getHuddle()
    if (huddle.active && huddle.participantIds.length === 0) {
      if (huddle.meetingId) await endMeeting(this.env, huddle.meetingId)
      await this.setHuddle(emptyHuddle())
      await this.env.DB.prepare('UPDATE channels SET huddle_meeting_id = NULL WHERE id = ?').bind(this.channelId()).run()
      this.broadcast({ t: 'huddle', huddle: emptyHuddle() })
    }
  }

  async fanout(msg: ServerMsg): Promise<void> {
    this.broadcast(msg)
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
      case 'typing':
        this.broadcast({ t: 'typing', userId: sock.userId }, ws)
        this.ctx.waitUntil(this.notifyGuild(authz.guildId, 'activity', sock.userId))
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
    if (authz.frozen || !hasPermission(authz.perms, Permission.sendMessages)) {
      this.send(ws, { t: 'error', code: 'frozen', message: 'You can no longer send messages to this user' })
      return
    }
    if (!body.content.trim() && !(body.attachmentIds?.length)) {
      this.send(ws, { t: 'error', code: 'bad_request', message: 'Empty message' })
      return
    }
    const limiter = asRpc<{ take: (n: number, w: number) => Promise<boolean> }>(this.env.RATE_LIMIT_DO.getByName(`user:${sock.userId}:msg`))
    const ok = await limiter.take(30, 10_000)
    if (!ok) {
      this.send(ws, { t: 'error', code: 'rate_limited', message: 'Slow down' })
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
    const mentions = extractMentionIds(body.content)
    const attachments = await this.bindAttachments(id, body.attachmentIds ?? [])
    let replyTo: MessageDTO['replyTo'] = null
    if (body.replyToId) {
      const row = await this.env.DB.prepare(
        'SELECT id, author_id, content FROM messages WHERE id = ? AND channel_id = ?',
      ).bind(body.replyToId, this.channelId()).first<{ id: string; author_id: string; content: string }>()
      if (row) replyTo = { id: row.id, authorId: row.author_id, content: row.content.slice(0, 180) }
    }

    const dto: MessageDTO = {
      id,
      channelId: this.channelId(),
      guildId: authz.guildId,
      author: sock.user,
      content: body.content,
      replyTo,
      mentions,
      attachments,
      reactions: [],
      threadId: null,
      editedAt: null,
      deletedAt: null,
      createdAt,
      clientId: body.clientId,
    }

    await this.ctx.storage.put(`idem:${idemKey}`, id)
    this.broadcast({ t: 'message', message: dto })
    this.send(ws, { t: 'ack', clientId: body.clientId, id })
    this.ctx.waitUntil(this.persistMessage(dto, body.replyToId ?? null))
    this.ctx.waitUntil(this.notifyGuild(authz.guildId, 'activity', sock.userId))
    if (isDmType(authz.type)) {
      this.ctx.waitUntil(this.env.DB.prepare('UPDATE dm_participants SET hidden_at = NULL WHERE channel_id = ?').bind(this.channelId()).run())
    }
  }

  private async onUpdate(ws: WebSocket, sock: Sock, body: z.infer<typeof updateSchema>) {
    const row = await this.env.DB.prepare(
      'SELECT id, author_id, channel_id, guild_id, content, reply_to_id, created_at, deleted_at FROM messages WHERE id = ?',
    ).bind(body.id).first<{
      id: string
      author_id: string
      channel_id: string
      guild_id: string
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
    const mentions = extractMentionIds(body.content)
    await this.env.DB.prepare('UPDATE messages SET content = ?, edited_at = ? WHERE id = ?').bind(body.content, editedAt, body.id).run()
    await this.env.DB.prepare('DELETE FROM message_mentions WHERE message_id = ?').bind(body.id).run()
    for (const uid of mentions) {
      await this.env.DB.prepare('INSERT OR IGNORE INTO message_mentions (message_id, user_id) VALUES (?, ?)').bind(body.id, uid).run()
    }
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
    await this.env.DB.prepare('UPDATE messages SET deleted_at = ?, content = ? WHERE id = ?').bind(deletedAt, '', id).run()
    this.broadcast({ t: 'message.delete', id })
  }

  private async onRead(sock: Sock, authz: Authz, messageId: string) {
    await this.env.DB.prepare(
      `INSERT INTO channel_reads (guild_id, channel_id, user_id, last_read_message_id, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(channel_id, user_id) DO UPDATE SET last_read_message_id = excluded.last_read_message_id, updated_at = excluded.updated_at`,
    ).bind(authz.guildId, this.channelId(), sock.userId, messageId, nowIso()).run()
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
    if (!realtimekitConfigured(this.env)) {
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
    const meeting = await createMeeting(this.env, `huddle:${this.channelId()}`)
    huddle = {
      active: true,
      huddleId: meeting.id,
      meetingId: meeting.id,
      participantIds: [sock.userId],
      startedBy: sock.userId,
      startedAt: nowIso(),
    }
    await this.setHuddle(huddle)
    await this.env.DB.prepare('UPDATE channels SET huddle_meeting_id = ? WHERE id = ?').bind(meeting.id, this.channelId()).run()
    await this.env.DB.prepare(
      'INSERT INTO audit_log (id, guild_id, actor_id, action, target_type, target_id, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(newId(), authz.guildId, sock.userId, 'huddle.start', 'channel', this.channelId(), '{}', nowIso()).run()
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
    this.send(ws, { t: 'hello', channelId: this.channelId(), you: user, huddle, frozen: authz.frozen, participants })
    this.ctx.waitUntil(this.notifyGuild(authz.guildId, 'connect', user.id))
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
      'SELECT id, guild_id, type, parent_id FROM channels WHERE id = ?',
    ).bind(this.channelId()).first<{ id: string; guild_id: string; type: string; parent_id: string | null }>()
    if (!ch) return null
    const type = normalizeChannelType(ch.type)
    let dmId: string | null = type === 'dm' ? ch.id : null
    if (type === 'thread' && ch.parent_id) {
      const parent = await this.env.DB.prepare('SELECT id, type FROM channels WHERE id = ?').bind(ch.parent_id).first<{ id: string; type: string }>()
      if (parent && isDmType(parent.type)) dmId = parent.id
    }
    if (dmId) {
      const part = await this.env.DB.prepare(
        'SELECT user_id FROM dm_participants WHERE channel_id = ? AND user_id = ?',
      ).bind(dmId, userId).first()
      if (!part) return null
      const parts = await this.env.DB.prepare('SELECT user_id FROM dm_participants WHERE channel_id = ?').bind(dmId).all<{ user_id: string }>()
      const ids = (parts.results ?? []).map((p) => p.user_id)
      let frozen = false
      if (ids.length) {
        const placeholders = ids.map(() => '?').join(',')
        const still = await this.env.DB.prepare(
          `SELECT user_id FROM guild_members WHERE guild_id = ? AND user_id IN (${placeholders})`,
        ).bind(ch.guild_id, ...ids).all<{ user_id: string }>()
        frozen = (still.results ?? []).length !== ids.length
      }
      const perms = frozen ? 0 : (MemberPermissions | Permission.startHuddle)
      return { guildId: ch.guild_id, type: dmId === ch.id ? 'dm' : type, perms, ownerId: '', frozen }
    }
    const row = await this.env.DB.prepare(
      `SELECT c.guild_id as guildId, c.type as type, r.permissions_bitmask as perms, g.owner_id as ownerId
       FROM channels c
       JOIN guild_members m ON m.guild_id = c.guild_id AND m.user_id = ?
       JOIN roles r ON r.id = m.role_id
       JOIN guilds g ON g.id = c.guild_id
       WHERE c.id = ?`,
    ).bind(userId, this.channelId()).first<{ guildId: string; type: string; perms: number; ownerId: string }>()
    if (!row) return null
    const perms = row.ownerId === userId ? ALL_PERMISSIONS : row.perms
    return { guildId: row.guildId, type: normalizeChannelType(row.type), perms, ownerId: row.ownerId, frozen: false }
  }

  private async loadDmParticipants(): Promise<PublicUser[]> {
    const ch = await this.env.DB.prepare('SELECT id, type, parent_id FROM channels WHERE id = ?').bind(this.channelId()).first<{ id: string; type: string; parent_id: string | null }>()
    if (!ch) return []
    const dmId = isDmType(ch.type) ? ch.id : ch.parent_id
    if (!dmId) return []
    const rows = await this.env.DB.prepare(
      `SELECT u.id, u.email, u.display_name, u.avatar_r2_key
       FROM dm_participants p JOIN users u ON u.id = p.user_id WHERE p.channel_id = ?`,
    ).bind(dmId).all<{ id: string; email: string; display_name: string; avatar_r2_key: string | null }>()
    return (rows.results ?? []).map((r) => ({ id: r.id, email: r.email, displayName: r.display_name, avatarR2Key: r.avatar_r2_key }))
  }

  private async persistMessage(dto: MessageDTO, replyToId: string | null) {
    try {
      await this.env.DB.prepare(
        'INSERT INTO messages (id, channel_id, guild_id, author_id, content, reply_to_id, edited_at, deleted_at, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)',
      ).bind(dto.id, dto.channelId, dto.guildId, dto.author.id, dto.content, replyToId, dto.createdAt).run()
      for (const uid of dto.mentions) {
        await this.env.DB.prepare('INSERT OR IGNORE INTO message_mentions (message_id, user_id) VALUES (?, ?)').bind(dto.id, uid).run()
      }
    }
    catch (err) {
      console.error('persist message failed', err)
    }
  }

  private async bindAttachments(messageId: string, ids: string[]): Promise<AttachmentDTO[]> {
    if (!ids.length) return []
    const out: AttachmentDTO[] = []
    for (const id of ids) {
      const row = await this.env.DB.prepare(
        'SELECT id, r2_key, filename, content_type, size_bytes, width, height FROM attachments WHERE id = ? AND (message_id IS NULL OR message_id = ?)',
      ).bind(id, messageId).first<{
        id: string
        r2_key: string
        filename: string
        content_type: string
        size_bytes: number
        width: number | null
        height: number | null
      }>()
      if (!row) continue
      await this.env.DB.prepare('UPDATE attachments SET message_id = ? WHERE id = ?').bind(messageId, id).run()
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

  private async loadMessage(id: string): Promise<MessageDTO | null> {
    const row = await this.env.DB.prepare(
      `SELECT m.id, m.channel_id, m.guild_id, m.content, m.reply_to_id, m.edited_at, m.deleted_at, m.created_at,
              u.id as uid, u.email, u.display_name, u.avatar_r2_key
       FROM messages m JOIN users u ON u.id = m.author_id WHERE m.id = ?`,
    ).bind(id).first<{
      id: string
      channel_id: string
      guild_id: string
      content: string
      reply_to_id: string | null
      edited_at: string | null
      deleted_at: string | null
      created_at: string
      uid: string
      email: string
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
    return {
      id: row.id,
      channelId: row.channel_id,
      guildId: row.guild_id,
      author: { id: row.uid, email: row.email, displayName: row.display_name, avatarR2Key: row.avatar_r2_key },
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
      threadId: null,
      editedAt: row.edited_at,
      deletedAt: row.deleted_at,
      createdAt: row.created_at,
    }
  }

  private async setHuddle(huddle: HuddleState) {
    await this.ctx.storage.put('huddle', huddle)
  }

  private async notifyGuild(guildId: string, kind: 'connect' | 'disconnect' | 'activity', userId: string) {
    try {
      const stub = asRpc<{
        userConnected: (id: string) => Promise<void>
        userDisconnected: (id: string) => Promise<void>
        userActivity: (id: string) => Promise<void>
      }>(this.env.GUILD_DO.getByName(`guild:${guildId}`))
      if (kind === 'connect') await stub.userConnected(userId)
      else if (kind === 'disconnect') await stub.userDisconnected(userId)
      else await stub.userActivity(userId)
    }
    catch (err) {
      console.error('guild notify failed', err)
    }
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

  private send(ws: WebSocket, msg: ServerMsg) {
    try { ws.send(JSON.stringify(msg)) }
    catch { /* ignore */ }
  }
}
