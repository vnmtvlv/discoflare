import type { DeployProgressReporter, DeployResponse } from '@discoflare/installer-core'
import { describe, expect, it } from 'vitest'
import { readDeployStream } from '../app/utils/deploy-stream'
import { createDeployStream } from '../server/utils/deploy-stream'

const result: DeployResponse = {
  url: 'https://workspace.example.com',
  version: '0.7.4',
  managementMode: 'admin',
  updated: true,
  appliedMigrations: [],
  verified: true,
  realtimekitEnabled: true,
  agentComputerEnabled: true,
  telemetry: { installationId: 'installation', token: 'token' },
}

describe('Admin deployment stream', () => {
  it('sends bytes immediately and keeps an idle Cloudflare operation alive', async () => {
    let finish!: (value: DeployResponse) => void
    const operation = new Promise<DeployResponse>((resolve) => { finish = resolve })
    const stream = createDeployStream(() => operation, { heartbeatMs: 5 })
    const reader = stream.getReader()

    const first = await reader.read()
    expect(new TextDecoder().decode(first.value)).toContain('"type":"heartbeat"')

    const second = await reader.read()
    expect(new TextDecoder().decode(second.value)).toContain('"type":"heartbeat"')

    finish(result)
    const complete = await reader.read()
    expect(new TextDecoder().decode(complete.value)).toContain('"type":"complete"')
  })

  it('decodes progress split across network chunks and returns the completion', async () => {
    const encoder = new TextEncoder()
    const progress = '{"type":"progress","step":"worker","state":"active"}\n'
    const complete = `${JSON.stringify({ type: 'complete', result })}\n`
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(progress.slice(0, 19)))
        controller.enqueue(encoder.encode(progress.slice(19) + complete))
        controller.close()
      },
    })
    const report: DeployProgressReporter = () => {}

    await expect(readDeployStream(new Response(body), report)).resolves.toEqual(result)
  })

  it('surfaces an operation error sent after streaming has started', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"type":"error","message":"Cloudflare rejected the upload"}\n'))
        controller.close()
      },
    })

    await expect(readDeployStream(new Response(body))).rejects.toThrow('Cloudflare rejected the upload')
  })
})
