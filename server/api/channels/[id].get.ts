import { requireChannelAccess } from '../../utils/guards'
import { cf } from '../../utils/cf'
import { toDmDto } from '../../utils/dms'
import { normalizeChannelType } from '../../../shared/dm'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const access = await requireChannelAccess(event, id)
  const { env } = cf(event)
  const ch = access.channel
  if (normalizeChannelType(ch.type) === 'dm') {
    return { channel: await toDmDto(env, ch, access.user.id, false), frozen: access.frozen }
  }
  return {
    channel: {
      id: ch.id,
      guildId: ch.guildId,
      name: ch.name,
      topic: ch.topic,
      type: normalizeChannelType(ch.type),
      position: ch.position,
      huddleMeetingId: ch.huddleMeetingId,
      parentId: ch.parentId,
      parentMessageId: ch.parentMessageId,
      unread: false,
      huddle: null,
      createdAt: ch.createdAt,
    },
    frozen: false,
  }
})
