type D1Reader = Pick<D1Database, 'prepare'>

export const channelUnreadSql = `
  SELECT EXISTS (
    SELECT 1
    FROM (
      SELECT m.channel_id, MAX(m.id) AS latest_message_id
      FROM messages m
      WHERE m.channel_id = ?
         OR m.channel_id IN (SELECT id FROM channels WHERE parent_id = ? AND type = 'thread')
      GROUP BY m.channel_id
    ) latest
    LEFT JOIN channel_reads cr
      ON cr.channel_id = latest.channel_id AND cr.user_id = ?
    WHERE cr.last_read_message_id IS NULL
       OR cr.last_read_message_id < latest.latest_message_id
  ) AS unread
`

export const channelUnreadCountSql = `
  SELECT COUNT(*) AS unread_count
  FROM messages m
  LEFT JOIN channel_reads cr
    ON cr.channel_id = m.channel_id AND cr.user_id = ?
  WHERE (m.channel_id = ?
     OR m.channel_id IN (SELECT id FROM channels WHERE parent_id = ? AND type = 'thread'))
    AND (cr.last_read_message_id IS NULL OR cr.last_read_message_id < m.id)
`

export function channelUnreadCountsSql(channelCount: number): string {
  if (!Number.isInteger(channelCount) || channelCount < 1) throw new Error('channelCount must be positive')
  const placeholders = Array.from({ length: channelCount }, () => '?').join(', ')
  return `
    SELECT root.id AS channel_id,
           CAST(SUM(CASE
             WHEN m.id IS NOT NULL
              AND (cr.last_read_message_id IS NULL OR cr.last_read_message_id < m.id)
             THEN 1 ELSE 0
           END) AS INTEGER) AS unread_count
    FROM channels root
    LEFT JOIN channels scoped
      ON scoped.id = root.id
      OR (scoped.parent_id = root.id AND scoped.type = 'thread')
    LEFT JOIN messages m ON m.channel_id = scoped.id
    LEFT JOIN channel_reads cr
      ON cr.channel_id = scoped.id AND cr.user_id = ?
    WHERE root.id IN (${placeholders})
    GROUP BY root.id
    ORDER BY root.id
  `
}

export async function channelHasUnread(db: D1Reader, userId: string, channelId: string): Promise<boolean> {
  const row = await db.prepare(channelUnreadSql).bind(channelId, channelId, userId).first<{ unread: number }>()
  return row?.unread === 1
}

export async function channelUnreadCount(db: D1Reader, userId: string, channelId: string): Promise<number> {
  const row = await db.prepare(channelUnreadCountSql).bind(userId, channelId, channelId).first<{ unread_count: number }>()
  return Number(row?.unread_count ?? 0)
}

export async function channelUnreadCounts(
  db: D1Reader,
  userId: string,
  channelIds: string[],
): Promise<Map<string, number>> {
  const ids = [...new Set(channelIds)]
  if (!ids.length) return new Map()
  const rows = await db.prepare(channelUnreadCountsSql(ids.length))
    .bind(userId, ...ids)
    .all<{ channel_id: string; unread_count: number }>()
  return new Map((rows.results ?? []).map(row => [row.channel_id, Number(row.unread_count)]))
}
