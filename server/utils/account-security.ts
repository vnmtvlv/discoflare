export function requireFreshAccountSession(session: { session: { createdAt: Date }, user: { id: string } } | null, now = Date.now()) {
  if (!session) throw createError({ statusCode: 401, statusMessage: 'Sign in to your account first' })
  if (now - new Date(session.session.createdAt).getTime() > 15 * 60 * 1000) {
    throw createError({ statusCode: 403, statusMessage: 'Sign out and sign in again before changing login methods' })
  }
  return session
}

/** D1 serializes this statement, so concurrent removals cannot remove every usable login. */
export async function removeAccountLogin(db: D1Database, userId: string, accountId: string, usableProviders: string[]) {
  if (!usableProviders.length) throw createError({ statusCode: 409, statusMessage: 'Keep at least one available login method' })
  const result = await db.prepare(`DELETE FROM auth_accounts WHERE id = ? AND user_id = ? AND EXISTS (
    SELECT 1 FROM auth_accounts AS remaining WHERE remaining.user_id = ? AND remaining.id <> ?
    AND remaining.provider_id IN (${usableProviders.map(() => '?').join(', ')})
  )`).bind(accountId, userId, userId, accountId, ...usableProviders).run()
  if (!result.meta.changes) throw createError({ statusCode: 409, statusMessage: 'Cannot remove this login. Keep at least one available login method.' })
}
