import type { DeployResponse } from '@discoflare/installer-core'

type WorkspaceHealth = {
  version?: string
  authMode?: 'access' | 'builtin'
  ok?: boolean
  ready?: boolean
  users?: number
  migrated?: boolean
  ownerSetup?: boolean
  realtimekit?: boolean
}

type VerificationOptions = {
  attempts?: number
  delayMs?: number
  fetch?: typeof fetch
  wait?: (delayMs: number) => Promise<void>
}

function healthyForAdmin(health: WorkspaceHealth, deployment: Pick<DeployResponse, 'version' | 'realtimekitEnabled'>) {
  const usable = health.ready
    || health.authMode === 'access'
    || (health.ownerSetup === true && health.users === 0)
  return health.version === deployment.version
    && health.ok === true
    && health.migrated === true
    && (!deployment.realtimekitEnabled || health.realtimekit === true)
    && usable
}

export async function verifyWorkspaceDeployment(
  deployment: Pick<DeployResponse, 'url' | 'version' | 'realtimekitEnabled'>,
  options: VerificationOptions = {},
): Promise<void> {
  const attempts = options.attempts ?? 30
  const delayMs = options.delayMs ?? 3_000
  const fetcher = options.fetch ?? fetch
  const wait = options.wait ?? (duration => new Promise(resolve => setTimeout(resolve, duration)))
  let lastFailure = ''

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt) await wait(delayMs)
    try {
      const response = await fetcher(`${deployment.url}/api/setup/health`, {
        headers: { Accept: 'application/json' },
        credentials: 'omit',
        redirect: 'follow',
        cache: 'no-store',
      })
      if (!response.ok) {
        lastFailure = `HTTP ${response.status}`
        continue
      }
      const health = await response.json() as WorkspaceHealth
      if (healthyForAdmin(health, deployment)) return
      lastFailure = `health response was not ready for Discoflare ${deployment.version}`
    }
    catch (cause) {
      lastFailure = cause instanceof Error ? cause.message : String(cause)
    }
  }

  throw new Error(`Discoflare ${deployment.version} was deployed, but browser health verification did not complete${lastFailure ? `: ${lastFailure}` : ''}`)
}
