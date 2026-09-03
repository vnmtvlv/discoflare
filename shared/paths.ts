export type ChannelRef = {
  id: string
  name?: string | null
  type?: string | null
}

export function channelPath(channel: string | ChannelRef, threadId?: string): string {
  const id = typeof channel === 'string' ? channel : channel.id
  if (threadId) return `/channels/${id}/threads/${threadId}`
  return `/channels/${id}`
}
