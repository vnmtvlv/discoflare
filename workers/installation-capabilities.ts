import type { RuntimeCapabilities } from '../shared/types'
import { authEmailAvailable, emailProvider } from './mail-transport'
import {
  aiProvider,
  browserProvider,
  callsProvider,
  cloudflareNetwork,
  type DiscoflareEnv,
} from './env'

export const UNAVAILABLE_CAPABILITIES: RuntimeCapabilities = {
  calls: false,
  containers: false,
  browser: null,
  emailOutbound: false,
  emailInbound: false,
  emailProvider: null,
  callsProvider: null,
}

/** Containers are not part of this product on any runtime. */
export function containersAvailable(): boolean {
  return false
}

export function installationCapabilities(env: DiscoflareEnv): RuntimeCapabilities {
  const network = cloudflareNetwork(env)
  const calls = callsProvider(env)
  return {
    calls: calls !== null,
    containers: containersAvailable(),
    browser: browserProvider(env),
    emailOutbound: authEmailAvailable(env),
    emailInbound: network,
    emailProvider: emailProvider(env),
    callsProvider: calls,
  }
}

export function installationAiModel(env: DiscoflareEnv): string | null {
  const provider = aiProvider(env)
  if (provider === 'openai-compatible') return env.AI_MODEL?.trim() || null
  if (provider === 'workers-ai' || provider === 'workers-ai-rest') return env.AGENT_MODEL?.trim() || null
  return null
}
