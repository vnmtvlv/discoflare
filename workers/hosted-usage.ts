import {
  HOSTED_INCLUDED_ALLOWANCE_MICROS,
  HOSTED_MODE_VALUE,
  HOSTED_USAGE_KEY,
  consumeHostedUsage,
  freshHostedUsageLedger,
  hostedUsageAvailable,
  microsForChatResult,
  parseHostedUsageLedger,
  rollHostedUsagePeriod,
  type HostedUsageLedger,
} from '../packages/admin-core/src/hosted-plan'
import type { DiscoflareEnv } from './env'

export function isHostedWorkspace(env: { DISCOFLARE_HOSTED?: string }): boolean {
  return env.DISCOFLARE_HOSTED === HOSTED_MODE_VALUE
}

export async function assertHostedAgentAllowance(env: DiscoflareEnv, now = new Date()): Promise<void> {
  if (!isHostedWorkspace(env)) return
  const ledger = await currentLedger(env, now)
  if (hostedUsageAvailable(ledger) <= 0) {
    throw new Error('This workspace has used its agent allowance for this month.')
  }
}

export async function recordHostedAgentUsage(env: DiscoflareEnv, model: string, result: unknown, now = new Date()): Promise<void> {
  if (!isHostedWorkspace(env)) return
  const ledger = await currentLedger(env, now)
  await writeLedger(env, consumeHostedUsage(ledger, microsForChatResult(model, result)))
}

async function currentLedger(env: DiscoflareEnv, now: Date): Promise<HostedUsageLedger> {
  const stored = parseHostedUsageLedger(await env.TICKETS.get(HOSTED_USAGE_KEY, 'json'))
  const base = stored ?? freshHostedUsageLedger(allowanceFromEnv(env), now)
  const rolled = rollHostedUsagePeriod(base, now)
  if (!stored || rolled !== base) await writeLedger(env, rolled)
  return rolled
}

function allowanceFromEnv(env: DiscoflareEnv): number {
  const parsed = Number(env.DISCOFLARE_AGENT_ALLOWANCE_MICROS)
  if (Number.isSafeInteger(parsed) && parsed > 0) return parsed
  return HOSTED_INCLUDED_ALLOWANCE_MICROS
}

async function writeLedger(env: DiscoflareEnv, ledger: HostedUsageLedger) {
  await env.TICKETS.put(HOSTED_USAGE_KEY, JSON.stringify(ledger))
}
