import { describe, expect, it } from 'vitest'
import { validateMigrationFileNames } from '../../scripts/check-migrations.mjs'

describe('migration policy', () => {
  it('accepts one contiguous migration for every number', () => {
    expect(validateMigrationFileNames([
      '0002_add_messages.sql',
      '0000_init.sql',
      '0001_add_channels.sql',
    ])).toEqual([
      { fileName: '0000_init.sql', number: 0 },
      { fileName: '0001_add_channels.sql', number: 1 },
      { fileName: '0002_add_messages.sql', number: 2 },
    ])
  })

  it('rejects two agents claiming the same number', () => {
    expect(() => validateMigrationFileNames([
      '0000_init.sql',
      '0001_add_channels.sql',
      '0001_add_messages.sql',
    ])).toThrow('Duplicate migration number 0001')
  })

  it('rejects gaps and names that do not follow the shared convention', () => {
    expect(() => validateMigrationFileNames([
      '0000_init.sql',
      '0002_add_messages.sql',
    ])).toThrow('expected 0001')
    expect(() => validateMigrationFileNames([
      '0000_Init.sql',
    ])).toThrow('must match NNNN_lowercase_name.sql')
  })
})
