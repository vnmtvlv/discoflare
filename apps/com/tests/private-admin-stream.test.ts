import type { DiscoflareAdminBootstrapResponse } from '@discoflare/installer-core'
import { describe, expect, it } from 'vitest'
import { readAdminBootstrapStream } from '../app/utils/admin-bootstrap-stream'
import { createAdminBootstrapStream } from '../server/utils/admin-bootstrap-stream'

const result: DiscoflareAdminBootstrapResponse = {
  origin: 'https://discoflare-admin.example.workers.dev',
  version: '0.8.1',
  workerName: 'discoflare-admin',
  updated: false,
  managementMode: 'private',
  tokenConnected: false,
}

describe('private Admin bootstrap stream', () => {
  it('sends bytes immediately while the Cloudflare bootstrap is still running', async () => {
    let finish!: (value: DiscoflareAdminBootstrapResponse) => void
    const operation = new Promise<DiscoflareAdminBootstrapResponse>((resolve) => { finish = resolve })
    const stream = createAdminBootstrapStream(() => operation, { heartbeatMs: 5 })
    const reader = stream.getReader()

    const first = await reader.read()
    expect(new TextDecoder().decode(first.value)).toContain('"type":"heartbeat"')

    const second = await reader.read()
    expect(new TextDecoder().decode(second.value)).toContain('"type":"heartbeat"')

    finish(result)
    const complete = await reader.read()
    expect(new TextDecoder().decode(complete.value)).toContain('"type":"complete"')
  })

  it('decodes a completion split across network chunks', async () => {
    const encoder = new TextEncoder()
    const heartbeat = '{"type":"heartbeat"}\n'
    const complete = `${JSON.stringify({ type: 'complete', result })}\n`
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(heartbeat + complete.slice(0, 23)))
        controller.enqueue(encoder.encode(complete.slice(23)))
        controller.close()
      },
    })

    await expect(readAdminBootstrapStream(new Response(body))).resolves.toEqual(result)
  })

  it('surfaces an operation error sent after streaming starts', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"type":"error","message":"Cloudflare rejected the upload"}\n'))
        controller.close()
      },
    })

    await expect(readAdminBootstrapStream(new Response(body))).rejects.toThrow('Cloudflare rejected the upload')
  })
})
