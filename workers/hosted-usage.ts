import {
  HOSTED_MODE_VALUE,
  HOSTED_USAGE_KEY,
  consumeHostedUsage,
  exhaustHostedUsage,
  freshHostedUsageLedger,
  hostedUsageAvailable,
  parseHostedModelRates,
  parseHostedUsageLedger,
  rollHostedUsagePeriod,
  unitsForChatResult,
  type HostedModelRates,
  type HostedUsageLedger,
} from '../packages/admin-core/src/hosted-plan'
import type { DiscoflareEnv } from './env'

export function isHostedWorkspace(env: { DISCOFLARE_HOSTED?: string }): boolean {
  return env.DISCOFLARE_HOSTED === HOSTED_MODE_VALUE
}

export async function assertHostedAgentLimit(env: DiscoflareEnv, now = new Date()): Promise<void> {
  if (!isHostedWorkspace(env)) return
  const ledger = await currentLedger(env, now)
  if (hostedUsageAvailable(ledger) <= 0) {
    throw new Error('This workspace has reached its agent usage limit for this month.')
  }
}

export async function recordHostedAgentUsage(env: DiscoflareEnv, model: string, result: unknown, now = new Date()): Promise<void> {
  if (!isHostedWorkspace(env)) return
  const ledger = await currentLedger(env, now)
  const units = unitsForChatResult(model, result, ratesFromEnv(env), unknownTurnUnits(env))
  await writeLedger(env, units == null ? exhaustHostedUsage(ledger) : consumeHostedUsage(ledger, units))
}

async function currentLedger(env: DiscoflareEnv, now: Date): Promise<HostedUsageLedger> {
  const stored = parseHostedUsageLedger(await env.TICKETS.get(HOSTED_USAGE_KEY, 'json'))
  const included = usageUnitsFromEnv(env)
  if (!stored && included == null) throw new Error('Agent usage limit is not configured.')
  const base = stored ?? freshHostedUsageLedger(included ?? 0, now)
  const rolled = rollHostedUsagePeriod(base, now)
  if (!stored || rolled !== base) await writeLedger(env, rolled)
  return rolled
}

function usageUnitsFromEnv(env: DiscoflareEnv): number | null {
  const parsed = Number(env.DISCOFLARE_AGENT_USAGE_UNITS)
  if (Number.isSafeInteger(parsed) && parsed > 0) return parsed
  return null
}

function unknownTurnUnits(env: DiscoflareEnv): number | null {
  if (env.DISCOFLARE_AGENT_UNKNOWN_TURN_UNITS == null || env.DISCOFLARE_AGENT_UNKNOWN_TURN_UNITS === '') return null
  const parsed = Number(env.DISCOFLARE_AGENT_UNKNOWN_TURN_UNITS)
  if (Number.isSafeInteger(parsed) && parsed >= 0) return parsed
  return null
}

function ratesFromEnv(env: DiscoflareEnv): HostedModelRates {
  if (!env.DISCOFLARE_AGENT_MODEL_RATES) return {}
  return parseHostedModelRates(env.DISCOFLARE_AGENT_MODEL_RATES) ?? {}
}

async function writeLedger(env: DiscoflareEnv, ledger: HostedUsageLedger) {
  await env.TICKETS.put(HOSTED_USAGE_KEY, JSON.stringify(ledger))
}
