import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { account, user, users } from '../../../drizzle/schema'
import { createSession, publicUser } from '../../utils/auth'
import { authFromEvent } from '../../utils/better-auth'
import { cf, fail } from '../../utils/cf'
import { ensureMigrated, getDb } from '../../utils/db'
import { verifyPassword } from '../../utils/password'
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

  const db = getDb(env.DB)
  const email = body.email.trim().toLowerCase()
  const row = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0]
  const dummy = 'scrypt$16384$8$1$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000'
  const ok = row ? await verifyPassword(body.password, row.passwordHash) : await verifyPassword(body.password, dummy)
  if (!row || !ok) fail(401, 'invalid_credentials', 'Invalid email or password')

  const now = Date.now()
  try {
    await db.insert(user).values({
      id: row.id,
      name: row.displayName,
      email: row.email,
      emailVerified: true,
      image: row.avatarR2Key,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    }).onConflictDoNothing()
    await db.insert(account).values({
      id: row.id,
      issuer: 'local:credential',
      accountId: row.id,
      providerId: 'credential',
      userId: row.id,
      password: row.passwordHash,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    }).onConflictDoNothing()
    const origin = getRequestURL(event).origin
    const res = await authFromEvent(event).handler(new Request(`${origin}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: getHeader(event, 'cookie') || '',
      },
      body: JSON.stringify({ email, password: body.password }),
    }))
    const setCookie = res.headers.getSetCookie?.() ?? []
    for (const cookie of setCookie) appendResponseHeader(event, 'set-cookie', cookie)
    if (!res.ok) await createSession(event, row.id)
  }
  catch {
    await createSession(event, row.id)
  }

  return { user: publicUser(row) }
})
