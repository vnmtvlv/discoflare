const MENTION_RE = /<@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>/gi

export function extractMentionIds(content: string): string[] {
  const ids = new Set<string>()
  for (const match of content.matchAll(MENTION_RE)) {
    if (match[1]) ids.add(match[1].toLowerCase())
  }
  return [...ids]
}

export function applyMentionTokens(
  content: string,
  members: Array<{ id: string; displayName: string; nickname?: string | null }>,
): string {
  return content.replace(/(^|[\s])@([^\s@]{1,32})/g, (full, prefix: string, name: string) => {
    const needle = name.toLowerCase()
    const hit = members.find((m) => {
      const nick = m.nickname?.toLowerCase()
      return m.displayName.toLowerCase() === needle || nick === needle
    })
    if (!hit) return full
    return `${prefix}<@${hit.id}>`
  })
}
