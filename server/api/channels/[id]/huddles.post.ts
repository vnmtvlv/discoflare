import { z } from 'zod'
import { newId, nowIso } from '../../../../shared/ids'
import { Permission } from '../../../../shared/permissions'
import { loadRealtimeKitConfig, realtimekitConfigured } from '../../../../workers/realtimekit'
import { cf, fail } from '../../../utils/cf'
import { requireChannelAccess } from '../../../utils/guards'
import { writeAudit } from '../../../utils/messages'
import { listScheduledHuddles } from '../../../utils/scheduled-huddles'
import { parseBody } from '../../../utils/validate'

const bodySchema = z.object({
  title: z.string().trim().max(80).default(''),
  startsAt: z.string().datetime({ offset: true }),
})

export default defineEventHandler(async (event) => {
  const channelId = getRouterParam(event, 'id')!
  const member = await requireChannelAccess(event, channelId, Permission.startHuddle)
  if (member.channel.type === 'thread') fail(400, 'bad_request', 'Schedule the huddle in the parent conversation')
  const body = parseBody(bodySchema, await readBody(event))
  const start = Date.parse(body.startsAt)
  if (start < Date.now() + 60_000) fail(400, 'bad_request', 'Choose a time at least one minute from now')
  if (start > Date.now() + 366 * 24 * 60 * 60 * 1000) fail(400, 'bad_request', 'Choose a time within the next year')

  const { env } = cf(event)
  if (!realtimekitConfigured(await loadRealtimeKitConfig(env))) {
    fail(501, 'realtimekit_unconfigured', 'RealtimeKit credentials missing')
  }
  const id = newId()
  const now = nowIso()
  await env.DB.prepare(
    `INSERT INTO scheduled_huddles
       (id, channel_id, title, starts_at, status, created_by, meeting_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'scheduled', ?, NULL, ?, ?)`,
  ).bind(id, channelId, body.title, new Date(start).toISOString(), member.user.id, now, now).run()
  await writeAudit(env, {
    workspaceId: member.workspaceId,
    actorId: member.user.id,
    action: 'huddle.schedule.create',
    targetType: 'scheduled_huddle',
    targetId: id,
    meta: { channelId, startsAt: new Date(start).toISOString() },
  })
  const stub = asRpc<{
    refreshScheduleAlarm: () => Promise<void>
    fanout: (message: unknown) => Promise<void>
  }>(env.CHANNEL_DO.getByName(`channel:${channelId}`))
  await stub.refreshScheduleAlarm()
  await stub.fanout({ t: 'huddle.schedule', channelId })
  const huddles = await listScheduledHuddles(env, channelId)
  return { huddle: huddles.find(huddle => huddle.id === id)! }
})
