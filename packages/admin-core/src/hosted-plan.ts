/**
 * Pure hosted-mode naming and usage-limit math. No imports, so the workspace
 * Worker and the Discoflare Admin can both use it.
 *
 * Usage is an integer unit chosen by the operator. Model rates and the included
 * amount are configuration, not constants in this module.
 */

export const HOSTED_CAPABILITY = 'hosted-workspace-v1'
export const HOSTED_USAGE_KEY = 'hosted:agent-usage'
export const HOSTED_MODE_VALUE = 'true'

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/u
const APEX = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u
const RESERVED_SLUGS = new Set(['www', 'api', 'admin', 'mail', 'hosted', 'status', 'app', 'cdn', 'static'])

export type HostedModelRate = {
  inputUnitsPerMillion: number
  outputUnitsPerMillion: number
}

export type HostedModelRates = Record<string, HostedModelRate>

export type HostedUsageLedger = {
  period: string
  includedUnits: number
  includedUsedUnits: number
  creditUnits: number
}

export function hostedUsagePeriod(now: Date): string {
  return now.toISOString().slice(0, 7)
}

export function freshHostedUsageLedger(includedUnits: number, now: Date): HostedUsageLedger {
  return {
    period: hostedUsagePeriod(now),
    includedUnits,
    includedUsedUnits: 0,
    creditUnits: 0,
  }
}

export function rollHostedUsagePeriod(ledger: HostedUsageLedger, now: Date): HostedUsageLedger {
  const period = hostedUsagePeriod(now)
  if (ledger.period === period) return ledger
  return { ...ledger, period, includedUsedUnits: 0 }
}

export function hostedUsageAvailable(ledger: HostedUsageLedger): number {
  return Math.max(0, ledger.includedUnits - ledger.includedUsedUnits) + ledger.creditUnits
}

export function consumeHostedUsage(ledger: HostedUsageLedger, units: number): HostedUsageLedger {
  const amount = Math.max(0, Math.ceil(units))
  const includedLeft = Math.max(0, ledger.includedUnits - ledger.includedUsedUnits)
  const fromIncluded = Math.min(amount, includedLeft)
  return {
    ...ledger,
    includedUsedUnits: ledger.includedUsedUnits + fromIncluded,
    creditUnits: ledger.creditUnits - (amount - fromIncluded),
  }
}

/** Spend the remaining included units and any positive credit. A negative balance stays. */
export function exhaustHostedUsage(ledger: HostedUsageLedger): HostedUsageLedger {
  return {
    ...ledger,
    includedUsedUnits: ledger.includedUnits,
    creditUnits: Math.min(ledger.creditUnits, 0),
  }
}

export function addHostedUsageCredit(ledger: HostedUsageLedger, units: number): HostedUsageLedger {
  return { ...ledger, creditUnits: ledger.creditUnits + Math.max(0, Math.floor(units)) }
}

export function hostedScriptName(slug: string): string {
  return `ws-${slug}`
}

export function hostedHostname(slug: string, apex: string): string {
  return `${slug}.${apex}`
}

export function isHostedSlug(slug: string): boolean {
  return SLUG.test(slug) && !RESERVED_SLUGS.has(slug)
}

export function isHostedApex(apex: string): boolean {
  return APEX.test(apex)
}

/** Label of `slug.apex`, or null when the hostname is the apex or not inside it. */
export function hostedSlugFromHostname(hostname: string, apex: string): string | null {
  const host = hostname.trim().toLowerCase().replace(/\.$/u, '')
  const zone = apex.trim().toLowerCase().replace(/\.$/u, '')
  const suffix = `.${zone}`
  if (!host.endsWith(suffix) || host === zone) return null
  const slug = host.slice(0, -suffix.length)
  if (!SLUG.test(slug)) return null
  return slug
}

export function parseHostedModelRates(value: unknown): HostedModelRates | null {
  const parsed = typeof value === 'string' ? safeJson(value) : value
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const rates: HostedModelRates = {}
  for (const [model, rate] of Object.entries(parsed as Record<string, unknown>)) {
    if (!model || !rate || typeof rate !== 'object') return null
    const input = (rate as { inputUnitsPerMillion?: unknown }).inputUnitsPerMillion
    const output = (rate as { outputUnitsPerMillion?: unknown }).outputUnitsPerMillion
    if (!isUnits(input) || !isUnits(output)) return null
    rates[model] = { inputUnitsPerMillion: input, outputUnitsPerMillion: output }
  }
  return rates
}

/** Null when the operator has not configured a rate for this model. */
export function unitsForTokens(model: string, inputTokens: number, outputTokens: number, rates: HostedModelRates): number | null {
  const rate = rates[model]
  if (!rate) return null
  const input = Math.max(0, inputTokens)
  const output = Math.max(0, outputTokens)
  return Math.ceil((input * rate.inputUnitsPerMillion + output * rate.outputUnitsPerMillion) / 1_000_000)
}

/**
 * Null when the turn cannot be priced from operator configuration.
 * `unknownTurnUnits` is used only when the response has no token counts.
 */
export function unitsForChatResult(
  model: string,
  result: unknown,
  rates: HostedModelRates,
  unknownTurnUnits: number | null,
): number | null {
  const tokens = chatTokens(result)
  if (!tokens) return unknownTurnUnits
  return unitsForTokens(model, tokens.input, tokens.output, rates)
}

function chatTokens(result: unknown): { input: number, output: number } | null {
  if (!result || typeof result !== 'object') return null
  const record = result as { usage?: unknown, totalUsage?: unknown }
  const usage = record.usage ?? record.totalUsage
  if (!usage || typeof usage !== 'object') return null
  const fields = usage as Record<string, unknown>
  const input = numberField(fields.inputTokens) ?? numberField(fields.promptTokens)
  const output = numberField(fields.outputTokens) ?? numberField(fields.completionTokens)
  if (input == null && output == null) return null
  return { input: input ?? 0, output: output ?? 0 }
}

function numberField(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function parseHostedUsageLedger(value: unknown): HostedUsageLedger | null {
  const parsed = typeof value === 'string' ? safeJson(value) : value
  if (!parsed || typeof parsed !== 'object') return null
  const ledger = parsed as Partial<HostedUsageLedger>
  if (!/^\d{4}-\d{2}$/u.test(String(ledger.period || ''))) return null
  if (!isUnits(ledger.includedUnits) || !isUnits(ledger.includedUsedUnits)) return null
  if (typeof ledger.creditUnits !== 'number' || !Number.isSafeInteger(ledger.creditUnits)) return null
  return {
    period: ledger.period as string,
    includedUnits: ledger.includedUnits,
    includedUsedUnits: ledger.includedUsedUnits,
    creditUnits: ledger.creditUnits,
  }
}

function isUnits(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  }
  catch {
    return null
  }
}
