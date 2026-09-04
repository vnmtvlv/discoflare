import { describe, expect, it } from 'vitest'
import { agentAvatarSources, agentAvatarSrc, userAvatarSrc } from '../../app/utils/agent-avatar'

describe('agent avatars', () => {
  it('assigns an included avatar deterministically', () => {
    const first = agentAvatarSrc('agent-123')

    expect(agentAvatarSources).toContain(first)
    expect(agentAvatarSrc('agent-123')).toBe(first)
  })

  it('only supplies generated avatars for agents', () => {
    expect(userAvatarSrc({ id: 'agent-1', kind: 'agent' })).toMatch(/^\/avatars\/agents\/.+\.png$/)
    expect(userAvatarSrc({ id: 'human-1', kind: 'human' })).toBeUndefined()
  })
})
