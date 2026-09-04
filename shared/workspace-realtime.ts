export type WorkspaceChannelActivityEvent = {
  t: 'channel.activity'
  sourceChannelId: string
  rootChannelId: string
  messageId: string
}

export type WorkspaceChannelReadEvent = {
  t: 'channel.read'
  sourceChannelId: string
  rootChannelId: string
  messageId: string
  unread: boolean
}

export type WorkspaceRealtimeEvent = WorkspaceChannelActivityEvent | WorkspaceChannelReadEvent
