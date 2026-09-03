import { DurableObject } from 'cloudflare:workers'
import type { PresenceStatus, PublicUser } from '../shared/types'
import type { DiscoflareEnv } from './env'
import { userFromTicket } from './ticket'

type SocketAttachment = { userId: string; lastActive: number }

const IDLE_MS = 5 * 60 * 1000
const PRESENCE_TICK_MS = 60_000

/** Owns installation-wide ephemeral presence. D1 remains the membership source of truth. */
export class WorkspaceDurableObject extends DurableObject<DiscoflareEnv> {
  constructor(ctx: DurableObjectState, env: DiscoflareEnv) {
    super(ctx, env)
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 })
    }
    const pair = new WebSocketPair()
    this.ctx.acceptWebSocket(pair[1])
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

    const attachment = ws.deserializeAttachment() as SocketAttachment | null
    if (parsed.t === 'auth' && parsed.token) {
      const user = await userFromTicket(this.env, parsed.token)
      if (!user) {
        ws.close(4001, 'unauthorized')
        return
      }
      await this.attach(ws, user)
      return
    }
    if (!attachment?.userId || parsed.t !== 'activity') return

    ws.serializeAttachment({ userId: attachment.userId, lastActive: Date.now() } satisfies SocketAttachment)
    this.broadcast()
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    const attachment = ws.deserializeAttachment() as SocketAttachment | null
    if (attachment?.userId) this.broadcast()
    await this.scheduleTick()
  }

  async snapshot(): Promise<Array<{ userId: string; status: PresenceStatus }>> {
    return this.currentPresence()
  }

  override async alarm(): Promise<void> {
    this.broadcast()
    await this.scheduleTick()
  }

  private async attach(ws: WebSocket, user: PublicUser) {
    ws.serializeAttachment({ userId: user.id, lastActive: Date.now() } satisfies SocketAttachment)
    this.send(ws, { t: 'hello', workspaceId: this.workspaceId() })
    this.broadcast()
    await this.scheduleTick()
  }

  private async authTimeout(ws: WebSocket) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    const attachment = ws.deserializeAttachment() as SocketAttachment | null
    if (!attachment?.userId) {
      try { ws.close(4001, 'unauthorized') }
      catch { /* already closed */ }
    }
  }

  private currentPresence(): Array<{ userId: string; status: PresenceStatus }> {
    const latest = new Map<string, number>()
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as SocketAttachment | null
      if (!attachment?.userId) continue
      latest.set(attachment.userId, Math.max(latest.get(attachment.userId) ?? 0, attachment.lastActive))
    }
    const now = Date.now()
    return [...latest.entries()].map(([userId, lastActive]) => ({
      userId,
      status: now - lastActive > IDLE_MS ? 'idle' : 'online',
    }))
  }

  private async scheduleTick() {
    const authenticated = this.ctx.getWebSockets().some((ws) => {
      const attachment = ws.deserializeAttachment() as SocketAttachment | null
      return Boolean(attachment?.userId)
    })
    if (authenticated) await this.ctx.storage.setAlarm(Date.now() + PRESENCE_TICK_MS)
    else await this.ctx.storage.deleteAlarm()
  }

  private workspaceId(): string {
    return (this.ctx.id.name ?? '').replace(/^workspace:/, '')
  }

  private broadcast() {
    const payload = JSON.stringify({ t: 'presence', users: this.currentPresence() })
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
