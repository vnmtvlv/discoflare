import { describe, expect, it } from 'vitest'
import { INIT_SQL } from '../../server/utils/db'

describe('D1 bootstrap schema', () => {
  it('passes one complete statement per line to D1 exec', () => {
    const lines = INIT_SQL.trim().split('\n')

    expect(lines.length).toBeGreaterThan(1)
    expect(lines.every(line => line.trim().endsWith(';'))).toBe(true)
  })
})
