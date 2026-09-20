import type { HuddleState, ScheduledHuddleDTO } from './types'

export type WorkspaceChannelActivityEvent = {
  t: 'channel.activity'
  sourceChannelId: string
  rootChannelId: string
  messageId: string
  notification: {
    title: string
    body: string
    url: string
  }
}

export type WorkspaceChannelReadEvent = {
  t: 'channel.read'
  sourceChannelId: string
  rootChannelId: string
  messageId: string
  unread: boolean
}

export type WorkspaceTasksChangedEvent = {
  t: 'tasks.changed'
  boardId: string | null
  taskId: string | null
}

export type WorkspaceMembersChangedEvent = {
  t: 'members.changed'
  workspaceId: string
}

export type WorkspaceHuddleChangedEvent = {
  t: 'huddle.changed'
  channelId: string
  huddle: HuddleState
  ring: boolean
  notification: {
    title: string
    body: string
    url: string
  }
}

export type WorkspaceHuddleScheduleEvent = {
  t: 'huddle.schedule'
  channelId: string
  schedule: ScheduledHuddleDTO
  ring: boolean
  notification: {
    title: string
    body: string
    url: string
  }
}

export type WorkspaceRealtimeEvent =
  | WorkspaceChannelActivityEvent
  | WorkspaceChannelReadEvent
  | WorkspaceTasksChangedEvent
  | WorkspaceMembersChangedEvent
  | WorkspaceHuddleChangedEvent
  | WorkspaceHuddleScheduleEvent
