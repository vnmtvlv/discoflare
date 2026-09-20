import { DurableObject } from 'cloudflare:workers'
import type { DiscoflareEnv } from './env'

export class RateLimitDurableObject extends DurableObject<DiscoflareEnv> {
  async take(limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now()
    const times = (await this.ctx.storage.get<number[]>('t')) ?? []
    const fresh = times.filter((t) => now - t < windowMs)
    if (fresh.length >= limit) {
      await this.ctx.storage.put('t', fresh)
      return false
    }
    fresh.push(now)
    await this.ctx.storage.put('t', fresh)
    return true
  }
}
