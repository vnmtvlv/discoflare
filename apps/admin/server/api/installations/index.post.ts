import { installDiscoflare, parseDeployRequest } from '@discoflare/installer-core'
import { sendStream, setResponseHeaders } from 'h3'
import { requireAccountToken, requireAdminConfig } from '../../utils/cloudflare'
import { createDeployStream } from '../../utils/deploy-stream'
import { assertAdminMutation, requireAdminIdentity } from '../../utils/security'

export default defineEventHandler(async (event) => {
  assertAdminMutation(event)
  await requireAdminIdentity(event)
  const token = await requireAccountToken(event)
  const { accountId, origin, sessionSecret, workerName: adminWorkerName } = requireAdminConfig(event)
  const body = await readBody(event)
  const requested = parseDeployRequest({
    ...(body && typeof body === 'object' ? body : {}),
    accountId,
    managementMode: 'admin',
    adminOrigin: origin,
    adminWorkerName,
    realtimekitEnabled: false,
    agentComputerEnabled: false,
    customDomainEnabled: false,
    zoneId: '',
    zoneName: '',
    appSubdomain: 'discoflare',
    mailEnabled: false,
    mailSubdomain: 'discoflare',
    mailLocalPart: 'inbox',
  })
  setResponseHeaders(event, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    'X-Accel-Buffering': 'no',
  })
  return sendStream(event, createDeployStream(report => installDiscoflare(token, requested, {
    report,
    verification: 'client',
    adminCapabilityKey: sessionSecret,
  })))
})
