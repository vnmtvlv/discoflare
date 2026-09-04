import type { UserKind } from '~~/shared/types'

export const agentAvatarSources = [
  '/avatars/agents/cyan.png',
  '/avatars/agents/violet.png',
  '/avatars/agents/amber.png',
  '/avatars/agents/mint.png',
] as const

export function agentAvatarSrc(id: string): string {
  let hash = 2166136261
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return agentAvatarSources[(hash >>> 0) % agentAvatarSources.length]!
}

export function userAvatarSrc(user: { id: string, kind: UserKind }): string | undefined {
  return user.kind === 'agent' ? agentAvatarSrc(user.id) : undefined
}
