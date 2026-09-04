import type { QueryClient } from '@tanstack/vue-query'
import type { ChannelDTO } from '~~/shared/types'
import type { WorkspaceRealtimeEvent } from '~~/shared/workspace-realtime'

type ChannelList = { channels: ChannelDTO[] }
type WorkspaceQueryCache = Pick<QueryClient, 'getQueryData' | 'setQueryData' | 'setQueriesData' | 'invalidateQueries'>

function applyUnread(cache: WorkspaceQueryCache, channelId: string, unread: boolean) {
  let found = false
  const update = (old: ChannelList | undefined) => {
    if (!old?.channels.some(channel => channel.id === channelId)) return old
    found = true
    return {
      ...old,
      channels: old.channels.map(channel => channel.id === channelId ? { ...channel, unread } : channel),
    }
  }
  cache.setQueriesData<ChannelList>({ queryKey: ['channels'] }, update)
  cache.setQueriesData<ChannelList>({ queryKey: ['dms'] }, update)
  if (!found) {
    void cache.invalidateQueries({ queryKey: ['channels'] })
    void cache.invalidateQueries({ queryKey: ['dms'] })
  }
}

export function applyWorkspaceRealtimeEvent(cache: WorkspaceQueryCache, event: WorkspaceRealtimeEvent) {
  const readCursor = cache.getQueryData<string>(['readCursor', event.sourceChannelId])
  if (event.t === 'channel.activity') {
    if (!readCursor || readCursor < event.messageId) applyUnread(cache, event.rootChannelId, true)
    return
  }
  if (!readCursor || readCursor < event.messageId) {
    cache.setQueryData(['readCursor', event.sourceChannelId], event.messageId)
  }
  applyUnread(cache, event.rootChannelId, event.unread)
}
