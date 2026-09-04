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

export async function channelHasUnread(db: D1Reader, userId: string, channelId: string): Promise<boolean> {
  const row = await db.prepare(channelUnreadSql).bind(channelId, channelId, userId).first<{ unread: number }>()
  return row?.unread === 1
}
