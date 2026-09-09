import type { H3Event } from 'h3'
import type { CommunityStats, InstallationHeartbeat } from '../../shared/telemetry'

type TelemetryBindings = {
  TELEMETRY_DB?: TelemetryDatabase
  NUXT_TELEMETRY_HASH_SECRET?: string
}

type TelemetryStatement = {
  bind: (...values: unknown[]) => TelemetryStatement
  run: () => Promise<{ meta: { changes?: number } }>
  first: <T>() => Promise<T | null>
}

export type TelemetryDatabase = {
  prepare: (query: string) => TelemetryStatement
}

export type InstallerTelemetry = {
  installationId: string
  token: string
  accountId: string
  workerName: string
  version: string
  email: boolean
  huddles: boolean
}

function bindings(event: H3Event): TelemetryBindings {
  const context = event.context as typeof event.context & {
    cloudflare?: { env?: TelemetryBindings }
  }
  return context.cloudflare?.env || {}
}

function bytes(value: string) {
  return new TextEncoder().encode(value)
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', bytes(value))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw', bytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const digest = await crypto.subtle.sign('HMAC', key, bytes(value))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export function telemetryDatabase(event: H3Event) {
  return bindings(event).TELEMETRY_DB
}

export async function recordInstallerDeployment(event: H3Event, record: InstallerTelemetry): Promise<boolean> {
  const env = bindings(event)
  const db = env.TELEMETRY_DB
  const secret = env.NUXT_TELEMETRY_HASH_SECRET?.trim() || String(useRuntimeConfig(event).telemetryHashSecret || '').trim()
  if (!db || !secret) return false

  const [accountWorkerHash, tokenHash] = await Promise.all([
    hmac(secret, `${record.accountId}:${record.workerName}`),
    sha256(record.token),
  ])
  const now = new Date().toISOString()
  await db.prepare(
    `INSERT INTO installations (
       installation_id, account_worker_hash, token_hash, version, deployments,
       has_d1, has_r2, has_kv, has_custom_domain, has_email, has_agents, has_huddles,
       first_seen_at, last_deployed_at, last_heartbeat_at
     ) VALUES (?, ?, ?, ?, 1, 1, 1, 1, 1, ?, 1, ?, ?, ?, ?)
     ON CONFLICT(account_worker_hash) DO UPDATE SET
       installation_id = excluded.installation_id,
       token_hash = excluded.token_hash,
       version = excluded.version,
       deployments = installations.deployments + 1,
       has_email = excluded.has_email,
       has_huddles = excluded.has_huddles,
       last_deployed_at = excluded.last_deployed_at,
       last_heartbeat_at = excluded.last_heartbeat_at`,
  ).bind(
    record.installationId,
    accountWorkerHash,
    tokenHash,
    record.version,
    record.email ? 1 : 0,
    record.huddles ? 1 : 0,
    now,
    now,
    now,
  ).run()
  return true
}

export async function recordInstallerDeletion(event: H3Event, accountId: string, workerName: string): Promise<boolean> {
  const env = bindings(event)
  const db = env.TELEMETRY_DB
  const secret = env.NUXT_TELEMETRY_HASH_SECRET?.trim() || String(useRuntimeConfig(event).telemetryHashSecret || '').trim()
  if (!db || !secret) return false
  const accountWorkerHash = await hmac(secret, `${accountId}:${workerName}`)
  await db.prepare('DELETE FROM installations WHERE account_worker_hash = ?').bind(accountWorkerHash).run()
  return true
}

export async function acceptHeartbeat(db: TelemetryDatabase, token: string, heartbeat: InstallationHeartbeat): Promise<boolean> {
  const tokenHash = await sha256(token)
  const now = new Date().toISOString()
  const result = await db.prepare(
    `UPDATE installations SET
       version = ?, has_d1 = ?, has_r2 = ?, has_kv = ?, has_custom_domain = ?,
       has_email = ?, has_agents = ?, has_huddles = ?, last_heartbeat_at = ?
     WHERE installation_id = ? AND token_hash = ?`,
  ).bind(
    heartbeat.version,
    heartbeat.capabilities.d1 ? 1 : 0,
    heartbeat.capabilities.r2 ? 1 : 0,
    heartbeat.capabilities.kv ? 1 : 0,
    heartbeat.capabilities.customDomain ? 1 : 0,
    heartbeat.capabilities.email ? 1 : 0,
    heartbeat.capabilities.agents ? 1 : 0,
    heartbeat.capabilities.huddles ? 1 : 0,
    now,
    heartbeat.installationId,
    tokenHash,
  ).run()
  return Number(result.meta.changes || 0) === 1
}

type StatsRow = {
  installations: number
  activeInstallations: number
  workerDeployments: number
  databases: number
  buckets: number
  domains: number
}

export async function communityStats(db?: TelemetryDatabase): Promise<CommunityStats> {
  const generatedAt = new Date().toISOString()
  if (!db) return { available: false, generatedAt, installations: 0, activeInstallations: 0, workerDeployments: 0, databases: 0, buckets: 0, domains: 0 }
  const activeSince = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const row = await db.prepare(
    `SELECT COUNT(*) AS installations,
       COALESCE(SUM(CASE WHEN last_heartbeat_at >= ? THEN 1 ELSE 0 END), 0) AS activeInstallations,
       COALESCE(SUM(deployments), 0) AS workerDeployments,
       COALESCE(SUM(has_d1), 0) AS databases,
       COALESCE(SUM(has_r2), 0) AS buckets,
       COALESCE(SUM(has_custom_domain + has_email), 0) AS domains
     FROM installations`,
  ).bind(activeSince).first<StatsRow>()
  return {
    available: true,
    generatedAt,
    installations: Number(row?.installations || 0),
    activeInstallations: Number(row?.activeInstallations || 0),
    workerDeployments: Number(row?.workerDeployments || 0),
    databases: Number(row?.databases || 0),
    buckets: Number(row?.buckets || 0),
    domains: Number(row?.domains || 0),
  }
}
