export const DatabaseFieldTypes = ['text', 'number', 'boolean', 'date', 'select'] as const

export type DatabaseFieldType = (typeof DatabaseFieldTypes)[number]
export type DatabaseValue = string | number | boolean | null

export const DatabaseSlotCounts: Record<DatabaseFieldType, number> = {
  text: 16,
  number: 8,
  boolean: 8,
  date: 8,
  select: 8,
}

const SLOT_PREFIX: Record<DatabaseFieldType, string> = {
  text: 'text',
  number: 'number',
  boolean: 'boolean',
  date: 'date',
  select: 'select',
}

/** Physical columns are allocated only from this server-known list. */
export function databaseSlots(type: DatabaseFieldType): string[] {
  return Array.from({ length: DatabaseSlotCounts[type] }, (_, index) => `${SLOT_PREFIX[type]}_${index + 1}`)
}

export function isDatabaseSlot(type: DatabaseFieldType, slot: string): boolean {
  return databaseSlots(type).includes(slot)
}

export function normalizeDatabaseOptions(options: Iterable<string>): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const raw of options) {
    const option = raw.trim()
    const key = option.toLocaleLowerCase()
    if (!option || seen.has(key)) continue
    seen.add(key)
    normalized.push(option)
  }
  return normalized
}
