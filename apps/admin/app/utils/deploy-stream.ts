import type { DeployProgressEvent, DeployProgressReporter, DeployResponse } from '@discoflare/installer-core'

type AdminDeployStreamEvent = DeployProgressEvent | { type: 'heartbeat' }

function failureMessage(value: unknown, fallback: string) {
  if (!value || typeof value !== 'object') return fallback
  const candidate = value as { statusMessage?: unknown, message?: unknown }
  if (typeof candidate.statusMessage === 'string') return candidate.statusMessage
  if (typeof candidate.message === 'string') return candidate.message
  return fallback
}

export async function readDeployStream(response: Response, report?: DeployProgressReporter): Promise<DeployResponse> {
  if (!response.ok) {
    const failure = await response.json().catch(() => null)
    throw new Error(failureMessage(failure, `Deployment failed (${response.status})`))
  }
  if (!response.body) throw new Error('Deployment progress stream was unavailable.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: DeployResponse | null = null

  const handle = async (line: string) => {
    if (!line.trim()) return
    const message = JSON.parse(line) as AdminDeployStreamEvent
    if (message.type === 'heartbeat') return
    if (message.type === 'error') throw new Error(message.message)
    if (message.type === 'complete') {
      result = message.result
      return
    }
    await report?.(message)
  }

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) await handle(line)
    if (done) break
  }
  await handle(buffer)
  if (!result) throw new Error('Deployment ended before the workspace was verified.')
  return result
}

