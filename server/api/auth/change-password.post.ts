import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { account, users } from '../../../drizzle/schema'
import { requireUser } from '../../utils/auth'
import { cf, fail } from '../../utils/cf'
import { getDb } from '../../utils/db'
import { hashPassword, verifyPassword } from '../../utils/password'
import { parseBody } from '../../utils/validate'

const bodySchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
})

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const body = parseBody(bodySchema, await readBody(event))
  const { env } = cf(event)
  const db = getDb(env.DB)
  const row = (await db.select().from(users).where(eq(users.id, me.id)).limit(1))[0]
  if (!row || !(await verifyPassword(body.currentPassword, row.passwordHash))) {
    fail(400, 'invalid_password', 'Current password is incorrect')
  }
  const hash = await hashPassword(body.newPassword)
  await db.update(users).set({ passwordHash: hash }).where(eq(users.id, me.id))
  await db.update(account).set({ password: hash }).where(eq(account.userId, me.id))
  return { ok: true }
})
