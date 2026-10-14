import type { RuntimeCapabilities } from '../shared/types'
import { authEmailAvailable } from './mail-transport'
import {
  aiProvider,
  browserProvider,
  cloudflareNetwork,
  type DiscoflareEnv,
} from './env'

export const UNAVAILABLE_CAPABILITIES: RuntimeCapabilities = {
  calls: false,
  containers: false,
  browser: null,
  emailOutbound: false,
  emailInbound: false,
}

/** Containers are not part of this product on any runtime. */
export function containersAvailable(): boolean {
  return false
}

export function installationCapabilities(env: DiscoflareEnv): RuntimeCapabilities {
  const network = cloudflareNetwork(env)
  return {
    calls: network,
    containers: containersAvailable(),
    browser: browserProvider(env),
    emailOutbound: authEmailAvailable(env),
    emailInbound: network,
  }
}

export function installationAiModel(env: DiscoflareEnv): string | null {
  const provider = aiProvider(env)
  if (provider === 'openai-compatible') return env.AI_MODEL?.trim() || null
  if (provider === 'workers-ai') return env.AGENT_MODEL?.trim() || null
  return null
}
