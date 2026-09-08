import type { ScheduledHuddleDTO, ScheduledHuddleStatus } from '../../shared/types'
import type { DiscoflareEnv } from '../../workers/env'

type ScheduledHuddleRow = {
  id: string
  channel_id: string
  title: string
  starts_at: string
  status: ScheduledHuddleStatus
  created_by: string
  meeting_id: string | null
  created_at: string
  updated_at: string
  creator_kind: 'human' | 'agent'
  creator_name: string
  creator_avatar: string | null
}

export function scheduledHuddleDto(row: ScheduledHuddleRow): ScheduledHuddleDTO {
  return {
    id: row.id,
    channelId: row.channel_id,
    title: row.title,
    startsAt: row.starts_at,
    status: row.status,
    createdBy: {
      id: row.created_by,
      kind: row.creator_kind,
      displayName: row.creator_name,
      avatarR2Key: row.creator_avatar,
    },
    meetingId: row.meeting_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listScheduledHuddles(env: DiscoflareEnv, channelId: string): Promise<ScheduledHuddleDTO[]> {
  const rows = await env.DB.prepare(
    `SELECT sh.id, sh.channel_id, sh.title, sh.starts_at, sh.status, sh.created_by,
            sh.meeting_id, sh.created_at, sh.updated_at,
            u.kind AS creator_kind, u.display_name AS creator_name, u.avatar_r2_key AS creator_avatar
     FROM scheduled_huddles sh
     JOIN users u ON u.id = sh.created_by
     WHERE sh.channel_id = ? AND sh.status IN ('scheduled', 'ready')
     ORDER BY sh.starts_at, sh.id`,
  ).bind(channelId).all<ScheduledHuddleRow>()
  return (rows.results ?? []).map(scheduledHuddleDto)
}
