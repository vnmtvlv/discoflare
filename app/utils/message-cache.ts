import type { InfiniteData } from '@tanstack/vue-query'
import type { MessageContextResponse, MessageDTO } from '~~/shared/types'

export type MessagePage = {
  messages: MessageDTO[]
  nextCursor: string | null
}

function compareMessages(left: MessageDTO, right: MessageDTO): number {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
}

/** Merge a context window into the infinite-query shape without corrupting its oldest cursor. */
export function mergeMessageContext(
  current: InfiniteData<MessagePage> | undefined,
  context: MessageContextResponse,
): InfiniteData<MessagePage> {
  const currentMessages = (current?.pages ?? []).flatMap(page => page.messages)
  const merged = new Map<string, MessageDTO>()
  for (const message of currentMessages) merged.set(message.id, message)
  for (const message of context.messages) merged.set(message.id, message)

  const messages = [...merged.values()].sort(compareMessages)
  const currentOldest = [...currentMessages].sort(compareMessages)[0]
  const contextOldest = context.messages[0]
  const currentHasOlder = Boolean(current?.pages.at(-1)?.nextCursor)
  let hasOlder: boolean

  if (!currentOldest) hasOlder = context.hasOlder
  else if (!contextOldest) hasOlder = currentHasOlder
  else {
    const oldestComparison = compareMessages(contextOldest, currentOldest)
    if (oldestComparison < 0) hasOlder = context.hasOlder
    else if (oldestComparison > 0) hasOlder = currentHasOlder
    else hasOlder = context.hasOlder || currentHasOlder
  }

  return {
    pages: [{ messages, nextCursor: hasOlder ? messages[0]?.id ?? null : null }],
    pageParams: [undefined],
  }
}
