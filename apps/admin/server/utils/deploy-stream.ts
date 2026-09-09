import type { DeployProgressEvent, DeployProgressReporter, DeployResponse } from '@discoflare/installer-core'

type AdminDeployStreamEvent = DeployProgressEvent | { type: 'heartbeat' }

type DeployStreamOptions = {
  heartbeatMs?: number
}

function deploymentErrorMessage(cause: unknown) {
  if (!cause || typeof cause !== 'object') return 'Deployment failed.'
  const candidate = cause as { statusMessage?: unknown, message?: unknown }
  if (typeof candidate.statusMessage === 'string') return candidate.statusMessage
  if (typeof candidate.message === 'string') return candidate.message
  return 'Deployment failed.'
}

export function createDeployStream(
  run: (report: DeployProgressReporter) => Promise<DeployResponse>,
  options: DeployStreamOptions = {},
) {
  const encoder = new TextEncoder()
  const heartbeatMs = options.heartbeatMs ?? 10_000
  let stop = () => {}

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true
      const dispose = () => {
        open = false
        clearInterval(heartbeat)
      }
      stop = dispose
      const write = (message: AdminDeployStreamEvent) => {
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
          // The operation may finish after the browser closes the progress stream.
        }
      }
      const heartbeat = setInterval(() => write({ type: 'heartbeat' }), heartbeatMs)

      write({ type: 'heartbeat' })
      void run(event => write(event))
        .then(result => write({ type: 'complete', result }))
        .catch(cause => write({ type: 'error', message: deploymentErrorMessage(cause) }))
        .finally(close)
    },
    cancel() {
      stop()
    },
  })
}
