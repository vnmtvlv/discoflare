import { installerError } from './errors.js'
import type { DeployRequest } from './types.js'

export function parseDeployRequest(value: unknown): DeployRequest {
  const body = value as Partial<DeployRequest> | null
  if (!body || typeof body !== 'object') installerError(400, 'Invalid deploy request')
  const accountId = String(body.accountId || '').trim()
  const workerName = String(body.workerName || '').trim().toLowerCase()
  const managementMode = body.managementMode === undefined ? 'manual' : body.managementMode
  if (managementMode !== 'manual' && managementMode !== 'managed' && managementMode !== 'admin') installerError(400, 'Select an installation management mode')
  const instanceAdminToken = typeof body.instanceAdminToken === 'string' ? body.instanceAdminToken.trim() : undefined
  const adminOrigin = body.adminOrigin === undefined ? undefined : installationOrigin(body.adminOrigin)
  const adminWorkerName = body.adminWorkerName === undefined ? undefined : String(body.adminWorkerName).trim().toLowerCase()
  const appName = String(body.appName || '').trim()
  const authMode = body.authMode === undefined ? 'builtin' : body.authMode
  if (authMode !== 'builtin' && authMode !== 'access') installerError(400, 'Select a sign-in mode')
  const customDomainEnabled = body.customDomainEnabled === true
  const zoneId = String(body.zoneId || '').trim()
  const zoneName = String(body.zoneName || '').trim().toLowerCase()
  const appSubdomain = String(body.appSubdomain || '').trim().toLowerCase()
  const mailEnabled = body.mailEnabled === true
  const mailSubdomain = String(body.mailSubdomain || '').trim().toLowerCase()
  const mailLocalPart = String(body.mailLocalPart || '').trim().toLowerCase()
  const realtimekitEnabled = body.realtimekitEnabled === true
  const realtimekitApiToken = String(body.realtimekitApiToken || '').trim()
  const agentComputerEnabled = body.agentComputerEnabled === undefined
    ? true
    : body.agentComputerEnabled === true
  if (!/^[0-9a-f]{32}$/u.test(accountId)) installerError(400, 'Select a Cloudflare account')
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(workerName)) installerError(400, 'Worker name must use lowercase letters, numbers, and hyphens')
  if (managementMode === 'admin' && (!adminOrigin || !adminWorkerName)) installerError(400, 'Discoflare Admin identity is required')
  if (adminWorkerName && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(adminWorkerName)) installerError(400, 'Admin Worker name must use lowercase letters, numbers, and hyphens')
  if (!appName || appName.length > 80) installerError(400, 'App name must be 1–80 characters')
  const zoneRequired = customDomainEnabled || mailEnabled
  if (zoneRequired && !/^[0-9a-f]{32}$/u.test(zoneId)) installerError(400, 'Select a Cloudflare domain')
  if (zoneRequired && !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(zoneName)) installerError(400, 'Invalid Cloudflare domain')
  if (customDomainEnabled && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(appSubdomain)) installerError(400, 'App subdomain must use lowercase letters, numbers, and hyphens')
  if (mailEnabled && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(mailSubdomain)) installerError(400, 'Email subdomain must use lowercase letters, numbers, and hyphens')
  if (mailEnabled && !/^[a-z0-9](?:[a-z0-9.!#$%&'*+/=?^_`{|}~-]{0,62}[a-z0-9])?$/u.test(mailLocalPart)) installerError(400, 'Enter a valid default mailbox')
  const registrationMode = body.registrationMode === undefined ? 'invite_only' : body.registrationMode
  if (authMode === 'builtin' && registrationMode !== 'invite_only' && registrationMode !== 'open') installerError(400, 'Select a registration mode')
  const adminEmail = String(body.adminEmail || '').trim().toLowerCase().slice(0, 254)
  if (adminEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(adminEmail)) installerError(400, 'Enter a valid owner email')
  const allowedEmails = authMode === 'access' && Array.isArray(body.allowedEmails)
    ? [...new Set(body.allowedEmails.map(item => String(item).trim().toLowerCase()).filter(Boolean))]
    : []
  if (allowedEmails.length > 20 || allowedEmails.some(email => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(email))) installerError(400, 'Enter at most 20 valid Access member emails')
  const targetVersion = typeof body.targetVersion === 'string' && /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/u.test(body.targetVersion)
    ? body.targetVersion
    : undefined
  if (body.targetVersion && !targetVersion) installerError(400, 'Invalid Discoflare release version')
  return {
    accountId,
    workerName,
    managementMode,
    instanceAdminToken,
    adminOrigin,
    adminWorkerName,
    appName,
    authMode,
    registrationMode: authMode === 'access' ? 'open' : registrationMode,
    adminEmail,
    allowedEmails: allowedEmails.filter(email => email !== adminEmail),
    customDomainEnabled,
    zoneId,
    zoneName,
    appSubdomain,
    mailEnabled,
    mailSubdomain,
    mailLocalPart,
    realtimekitEnabled,
    realtimekitApiToken,
    agentComputerEnabled,
    targetVersion,
  }
}

function installationOrigin(value: unknown): string {
  try {
    const url = new URL(String(value || ''))
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error()
    return url.origin
  }
  catch {
    installerError(400, 'Discoflare Admin origin is invalid')
  }
}
