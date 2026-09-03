import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '../../../drizzle/schema'
import { nowIso } from '../../../shared/ids'
import { publicUser } from '../../utils/auth'
import { authFromEvent } from '../../utils/better-auth'
import { cf, fail } from '../../utils/cf'
import { ensureMigrated, getDb } from '../../utils/db'
import { parseBody } from '../../utils/validate'

const bodySchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
})

export default defineEventHandler(async (event) => {
  const body = parseBody(bodySchema, await readBody(event))
  const { env } = cf(event)
  await ensureMigrated(env.DB)
  const ip = getHeader(event, 'cf-connecting-ip') || getHeader(event, 'x-forwarded-for') || 'local'
  let allowed = true
  try {
    const limiter = asRpc<{ take: (limit: number, windowMs: number) => Promise<boolean> }>(env.RATE_LIMIT_DO.getByName(`ip:${ip}:login`))
    allowed = await limiter.take(5, 15 * 60 * 1000)
  }
  catch {
    // nuxt cloudflare-dev does not export DOs
  }
  if (!allowed) fail(429, 'rate_limited', 'Too many login attempts')

  const email = body.email.trim().toLowerCase()
  const res = await authFromEvent(event).api.signInEmail({
    headers: event.headers,
    body: {
      email,
      password: body.password,
    },
    asResponse: true,
  })
  if (!res.ok) fail(401, 'invalid_credentials', 'Invalid email or password')
  for (const cookie of res.headers.getSetCookie?.() ?? []) appendResponseHeader(event, 'set-cookie', cookie)
  const signedIn = await res.json() as { user: { id: string; email: string; name: string; image?: string | null } }
  const db = getDb(env.DB)
  let row = (await db.select().from(users).where(eq(users.id, signedIn.user.id)).limit(1))[0]
  if (!row) {
    const created = nowIso()
    await db.insert(users).values({
      id: signedIn.user.id,
      displayName: signedIn.user.name || signedIn.user.email.split('@')[0] || 'member',
      avatarR2Key: signedIn.user.image ?? null,
      status: 'pending',
      roleId: null,
      nickname: null,
      joinedAt: null,
      createdAt: created,
      updatedAt: created,
    })
    row = (await db.select().from(users).where(eq(users.id, signedIn.user.id)).limit(1))[0]!
  }

  return { user: { ...publicUser(row), email: signedIn.user.email } }
})
