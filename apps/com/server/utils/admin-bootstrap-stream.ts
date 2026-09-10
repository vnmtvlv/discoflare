import type { DiscoflareAdminBootstrapResponse } from '@discoflare/installer-core'

type AdminBootstrapStreamEvent =
  | { type: 'heartbeat' }
  | { type: 'complete', result: DiscoflareAdminBootstrapResponse }
  | { type: 'error', message: string }

type AdminBootstrapStreamOptions = {
  heartbeatMs?: number
}

function bootstrapErrorMessage(cause: unknown) {
  if (!cause || typeof cause !== 'object') return 'Discoflare Admin could not be installed.'
  const candidate = cause as {
    data?: { statusMessage?: unknown }
    statusMessage?: unknown
    message?: unknown
  }
  if (typeof candidate.data?.statusMessage === 'string') return candidate.data.statusMessage
  if (typeof candidate.statusMessage === 'string') return candidate.statusMessage
  if (typeof candidate.message === 'string') return candidate.message
  return 'Discoflare Admin could not be installed.'
}

export function createAdminBootstrapStream(
  run: () => Promise<DiscoflareAdminBootstrapResponse>,
  options: AdminBootstrapStreamOptions = {},
) {
  const encoder = new TextEncoder()
  const heartbeatMs = options.heartbeatMs ?? 5_000
  let stop = () => {}

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true
      const dispose = () => {
        open = false
        clearInterval(heartbeat)
      }
      stop = dispose
      const write = (message: AdminBootstrapStreamEvent) => {
        if (!open) return
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`))
        }
        catch {
          dispose()
        }
      }
      const close = () => {
        const shouldClose = open
        dispose()
        if (!shouldClose) return
        try {
          controller.close()
        }
        catch {
          // The bootstrap may finish after the browser closes the stream.
        }
      }
      const heartbeat = setInterval(() => write({ type: 'heartbeat' }), heartbeatMs)

      write({ type: 'heartbeat' })
      void run()
        .then(result => write({ type: 'complete', result }))
        .catch(cause => write({ type: 'error', message: bootstrapErrorMessage(cause) }))
        .finally(close)
    },
    cancel() {
      stop()
    },
  })
}
