import type { DeployProgressEvent, DeployResponse } from '../../packages/installer-core/src/types'

type StreamEvent = DeployProgressEvent | { type: 'heartbeat' }

export async function readDeployStream(response: Response): Promise<DeployResponse> {
  if (!response.ok) throw new Error(`Deployment failed (${response.status})`)
  if (!response.body) throw new Error('Deployment progress stream was unavailable.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: DeployResponse | null = null

  const readLine = (line: string) => {
    if (!line.trim()) return
    const message = JSON.parse(line) as StreamEvent
    if (message.type === 'error') throw new Error(message.message)
    if (message.type === 'complete') result = message.result
  }
  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) readLine(line)
    if (done) break
  }
  readLine(buffer)
  if (!result) throw new Error('Deployment ended before the capability was enabled.')
  return result
}
