/**
 * Pure Hosted naming, pricing, and allowance math. No imports, so the workspace
 * Worker and the Discoflare Admin can both use it.
 *
 * Prices are USD micros ($1 = 1_000_000) so the ledger stays integer.
 * Workers AI rates are from the published token prices (October 2026).
 */

export const HOSTED_CAPABILITY = 'hosted-workspace-v1'
export const HOSTED_DISPATCH_NAMESPACE = 'discoflare-hosted'
export const HOSTED_USAGE_KEY = 'hosted:agent-usage'
/** $5 of Workers AI per workspace per calendar month, before usage packs. */
export const HOSTED_INCLUDED_ALLOWANCE_MICROS = 5_000_000
/** Charged when a completed turn does not report token counts. */
export const HOSTED_UNKNOWN_TURN_MICROS = 200_000
export const HOSTED_MODE_VALUE = 'true'

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/u
const APEX = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u
const RESERVED_SLUGS = new Set(['www', 'api', 'admin', 'mail', 'hosted', 'status', 'app', 'cdn', 'static'])

/** Fallback is the highest published Workers AI chat rate so an unlisted model cannot be undercharged. */
const FALLBACK_RATE = { inputPerMillion: 1_400_000, outputPerMillion: 4_400_000 }
const MODEL_RATES: Record<string, { inputPerMillion: number, outputPerMillion: number }> = {
  '@cf/moonshotai/kimi-k2.7-code': { inputPerMillion: 950_000, outputPerMillion: 4_000_000 },
  '@cf/moonshotai/kimi-k2.6': { inputPerMillion: 950_000, outputPerMillion: 4_000_000 },
  '@cf/moonshotai/kimi-k2.5': { inputPerMillion: 600_000, outputPerMillion: 3_000_000 },
  '@cf/zai-org/glm-5.2': FALLBACK_RATE,
  '@cf/zai-org/glm-5.3': FALLBACK_RATE,
}

export type HostedUsageLedger = {
  period: string
  includedMicros: number
  includedUsedMicros: number
  creditMicros: number
}

export function hostedUsagePeriod(now: Date): string {
  return now.toISOString().slice(0, 7)
}

export function freshHostedUsageLedger(includedMicros: number, now: Date): HostedUsageLedger {
  return {
    period: hostedUsagePeriod(now),
    includedMicros,
    includedUsedMicros: 0,
    creditMicros: 0,
  }
}

export function rollHostedUsagePeriod(ledger: HostedUsageLedger, now: Date): HostedUsageLedger {
  const period = hostedUsagePeriod(now)
  if (ledger.period === period) return ledger
  return { ...ledger, period, includedUsedMicros: 0 }
}

export function hostedUsageAvailable(ledger: HostedUsageLedger): number {
  return Math.max(0, ledger.includedMicros - ledger.includedUsedMicros) + ledger.creditMicros
}

export function consumeHostedUsage(ledger: HostedUsageLedger, micros: number): HostedUsageLedger {
  const amount = Math.max(0, Math.ceil(micros))
  const includedLeft = Math.max(0, ledger.includedMicros - ledger.includedUsedMicros)
  const fromIncluded = Math.min(amount, includedLeft)
  return {
    ...ledger,
    includedUsedMicros: ledger.includedUsedMicros + fromIncluded,
    creditMicros: ledger.creditMicros - (amount - fromIncluded),
  }
}

export function addHostedUsageCredit(ledger: HostedUsageLedger, micros: number): HostedUsageLedger {
  return { ...ledger, creditMicros: ledger.creditMicros + Math.max(0, Math.floor(micros)) }
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

export function microsForTokens(model: string, inputTokens: number, outputTokens: number): number {
  const rate = MODEL_RATES[model] ?? FALLBACK_RATE
  const input = Math.max(0, inputTokens)
  const output = Math.max(0, outputTokens)
  return Math.ceil((input * rate.inputPerMillion + output * rate.outputPerMillion) / 1_000_000)
}

export function microsForChatResult(model: string, result: unknown): number {
  const tokens = chatTokens(result)
  if (!tokens) return HOSTED_UNKNOWN_TURN_MICROS
  return microsForTokens(model, tokens.input, tokens.output)
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
  if (!isMicros(ledger.includedMicros) || !isMicros(ledger.includedUsedMicros)) return null
  if (typeof ledger.creditMicros !== 'number' || !Number.isSafeInteger(ledger.creditMicros)) return null
  return {
    period: ledger.period as string,
    includedMicros: ledger.includedMicros,
    includedUsedMicros: ledger.includedUsedMicros,
    creditMicros: ledger.creditMicros,
  }
}

function isMicros(value: unknown): value is number {
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
