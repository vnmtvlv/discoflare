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

export type MailFolder = 'inbox' | 'archive' | 'spam' | 'trash'

export const MAIL_FOLDERS: MailFolder[] = ['inbox', 'archive', 'spam', 'trash']

export function isMailFolder(value: unknown): value is MailFolder {
  return typeof value === 'string' && (MAIL_FOLDERS as string[]).includes(value)
}

export function mailPath(mailboxId: string, folder: MailFolder = 'inbox', threadId?: string): string {
  const path = `/mail/${mailboxId}/${folder}`
  return threadId ? `${path}?thread=${threadId}` : path
}

export function boardPath(boardId?: string | null, archived = false): string {
  const query = new URLSearchParams()
  if (boardId) query.set('board', boardId)
  if (archived) query.set('archived', '1')
  const suffix = query.toString()
  return suffix ? `/tasks?${suffix}` : '/tasks'
}
