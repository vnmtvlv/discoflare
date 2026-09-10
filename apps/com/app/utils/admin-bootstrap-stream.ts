import type { DiscoflareAdminBootstrapResponse } from '@discoflare/installer-core'

type AdminBootstrapStreamEvent =
  | { type: 'heartbeat' }
  | { type: 'complete', result: DiscoflareAdminBootstrapResponse }
  | { type: 'error', message: string }

function failureMessage(value: unknown, fallback: string) {
  if (!value || typeof value !== 'object') return fallback
  const candidate = value as {
    data?: { statusMessage?: unknown }
    statusMessage?: unknown
    message?: unknown
  }
  if (typeof candidate.data?.statusMessage === 'string') return candidate.data.statusMessage
  if (typeof candidate.statusMessage === 'string') return candidate.statusMessage
  if (typeof candidate.message === 'string') return candidate.message
  return fallback
}

export async function readAdminBootstrapStream(response: Response): Promise<DiscoflareAdminBootstrapResponse> {
  if (!response.ok) {
    const failure = await response.json().catch(() => null)
    throw new Error(failureMessage(failure, `Discoflare Admin could not be installed (${response.status})`))
  }
  if (!response.body) throw new Error('Discoflare Admin installation stream was unavailable.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: DiscoflareAdminBootstrapResponse | null = null

  const handle = (line: string) => {
    if (!line.trim()) return
    const message = JSON.parse(line) as AdminBootstrapStreamEvent
    if (message.type === 'heartbeat') return
    if (message.type === 'error') throw new Error(message.message)
    result = message.result
  }

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) handle(line)
    if (done) break
  }
  handle(buffer)
  if (!result) throw new Error('Discoflare Admin installation ended before the deployment was verified.')
  return result
}
