import { DurableObject } from 'cloudflare:workers'
import type { PresenceStatus, PublicUser } from '../shared/types'
import type { DiscoflareEnv } from './env'
import { readCookie, SESSION_COOKIE } from './env'
import { userFromSession } from './session'

type Rec = { status: PresenceStatus; lastActive: number; sockets: number }

const IDLE_MS = 5 * 60 * 1000

export class GuildDurableObject extends DurableObject<DiscoflareEnv> {
  private users = new Map<string, Rec>()

  constructor(ctx: DurableObjectState, env: DiscoflareEnv) {
    super(ctx, env)
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
    this.ctx.storage.setAlarm(Date.now() + 60_000).catch(() => {})
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 })
    }
    const pair = new WebSocketPair()
    this.ctx.acceptWebSocket(pair[1])
    const token = readCookie(request.headers.get('Cookie'), SESSION_COOKIE)
    if (token) {
      const user = await userFromSession(this.env, token)
      if (user) this.attach(pair[1], user)
    }
    this.ctx.waitUntil(this.authTimeout(pair[1]))
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return
    let parsed: { t?: string; token?: string }
    try {
      parsed = JSON.parse(message) as { t?: string; token?: string }
    }
    catch {
      return
    }
    const att = ws.deserializeAttachment() as { userId?: string } | null
    if (parsed.t === 'auth' && parsed.token) {
      const user = await userFromSession(this.env, parsed.token)
      if (!user) {
        ws.close(4001, 'unauthorized')
        return
      }
      this.attach(ws, user)
      return
    }
    if (!att?.userId) return
    if (parsed.t === 'activity') await this.userActivity(att.userId)
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as { userId?: string } | null
    if (att?.userId) await this.userDisconnected(att.userId)
  }

  async userConnected(userId: string): Promise<void> {
    const rec = this.users.get(userId) ?? { status: 'online' as const, lastActive: Date.now(), sockets: 0 }
    rec.sockets += 1
    rec.status = 'online'
    rec.lastActive = Date.now()
    this.users.set(userId, rec)
    this.broadcast()
  }

  async userDisconnected(userId: string): Promise<void> {
    const rec = this.users.get(userId)
    if (!rec) return
    rec.sockets = Math.max(0, rec.sockets - 1)
    if (rec.sockets === 0) {
      rec.status = 'offline'
      this.users.set(userId, rec)
    }
    this.broadcast()
  }

  async userActivity(userId: string): Promise<void> {
    const rec = this.users.get(userId) ?? { status: 'online' as const, lastActive: Date.now(), sockets: 1 }
    rec.lastActive = Date.now()
    rec.status = 'online'
    this.users.set(userId, rec)
    this.broadcast()
  }

  async snapshot(): Promise<Array<{ userId: string; status: PresenceStatus }>> {
    return [...this.users.entries()].map(([userId, rec]) => ({ userId, status: rec.status }))
  }

  override async alarm(): Promise<void> {
    const now = Date.now()
    let changed = false
    for (const rec of this.users.values()) {
      if (rec.status === 'online' && rec.sockets > 0 && now - rec.lastActive > IDLE_MS) {
        rec.status = 'idle'
        changed = true
      }
    }
    if (changed) this.broadcast()
    await this.ctx.storage.setAlarm(now + 60_000)
  }

  private attach(ws: WebSocket, user: PublicUser) {
    ws.serializeAttachment({ userId: user.id })
    this.ctx.waitUntil(this.userConnected(user.id))
    this.send(ws, { t: 'hello', guildId: this.guildId() })
    this.send(ws, { t: 'presence', users: [...this.users.entries()].map(([userId, rec]) => ({ userId, status: rec.status })) })
  }

  private async authTimeout(ws: WebSocket) {
    await new Promise((r) => setTimeout(r, 2000))
    const att = ws.deserializeAttachment() as { userId?: string } | null
    if (!att?.userId) {
      try { ws.close(4001, 'unauthorized') }
      catch { /* already closed */ }
    }
  }

  private guildId(): string {
    return (this.ctx.id.name ?? '').replace(/^guild:/, '')
  }

  private broadcast() {
    const users = [...this.users.entries()].map(([userId, rec]) => ({ userId, status: rec.status }))
    const payload = JSON.stringify({ t: 'presence', users })
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(payload) }
      catch { /* ignore */ }
    }
  }

  private send(ws: WebSocket, msg: unknown) {
    try { ws.send(JSON.stringify(msg)) }
    catch { /* ignore */ }
  }
}
