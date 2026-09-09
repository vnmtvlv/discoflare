import { describe, expect, it } from 'vitest'
import { allowedAdminHealthOrigin } from '../../server/utils/health-cors'

describe('Admin health CORS', () => {
  it('allows only the configured Discoflare Admin origin', () => {
    expect(allowedAdminHealthOrigin(
      'https://discoflare-admin.example.workers.dev',
      'https://discoflare-admin.example.workers.dev',
    )).toBe('https://discoflare-admin.example.workers.dev')
    expect(allowedAdminHealthOrigin(
      'https://attacker.example',
      'https://discoflare-admin.example.workers.dev',
    )).toBeNull()
  })

  it('normalizes configured URLs without accepting paths or credentials', () => {
    expect(allowedAdminHealthOrigin(
      'https://discoflare-admin.example.workers.dev',
      'https://discoflare-admin.example.workers.dev/',
    )).toBe('https://discoflare-admin.example.workers.dev')
    expect(allowedAdminHealthOrigin(
      'https://discoflare-admin.example.workers.dev',
      'https://user@example.workers.dev',
    )).toBeNull()
  })
})
