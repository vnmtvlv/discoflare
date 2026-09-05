import { beforeAll, describe, expect, it, vi } from 'vitest'
import { originOk } from '../../server/utils/cf'

type TestEvent = {
  method: string
  headers: Record<string, string | undefined>
}

beforeAll(() => {
  vi.stubGlobal('getHeader', (event: TestEvent, name: string) => event.headers[name])
})

describe('request origin checks', () => {
  it('accepts native requests carrying the non-simple client header', () => {
    expect(originOk({
      method: 'POST',
      headers: {
        host: 'sandbox.discoflare.com',
        origin: 'capacitor://localhost',
        'x-discoflare-client': 'native',
      },
    } as never)).toBe(true)
  })

  it('accepts extension requests carrying the non-simple client header', () => {
    expect(originOk({
      method: 'POST',
      headers: {
        host: 'sandbox.discoflare.com',
        origin: 'chrome-extension://abcdefghijklmnop',
        'x-discoflare-client': 'extension',
      },
    } as never)).toBe(true)
  })

  it('continues to reject mismatched browser origins', () => {
    expect(originOk({
      method: 'POST',
      headers: {
        host: 'sandbox.discoflare.com',
        origin: 'https://evil.example',
      },
    } as never)).toBe(false)
  })
})
