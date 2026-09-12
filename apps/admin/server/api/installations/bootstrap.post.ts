import { installDiscoflare, readDiscoflareInstallation } from '@discoflare/installer-core'
import { sendStream, setResponseHeaders } from 'h3'
import { requireAccountToken, requireAdminConfig } from '../../utils/cloudflare'
import { createDeployStream } from '../../utils/deploy-stream'
import { assertAdminMutation, requireAdminIdentity } from '../../utils/security'

export default defineEventHandler(async (event) => {
  assertAdminMutation(event)
  await requireAdminIdentity(event)
  const token = await requireAccountToken(event)
  const { accountId, email, origin, sessionSecret, workerName: adminWorkerName } = requireAdminConfig(event)
  const existing = await readDiscoflareInstallation(token, accountId, 'discoflare')

  const request = existing
    ? {
        ...existing.configuration,
        managementMode: 'admin' as const,
        adminOrigin: origin,
        adminWorkerName,
      }
    : {
        accountId,
        workerName: 'discoflare',
        managementMode: 'admin' as const,
        adminOrigin: origin,
        adminWorkerName,
        adminEmail: email,
        allowedEmails: [],
        appName: 'Discoflare',
        authMode: 'builtin' as const,
        registrationMode: 'invite_only' as const,
        customDomainEnabled: false,
        zoneId: '',
        zoneName: '',
        appSubdomain: 'discoflare',
        mailEnabled: false,
        mailSubdomain: 'discoflare',
        mailLocalPart: 'inbox',
        realtimekitEnabled: false,
        realtimekitApiToken: '',
        agentComputerEnabled: false,
      }

  setResponseHeaders(event, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    'X-Accel-Buffering': 'no',
  })
  return sendStream(event, createDeployStream(report => installDiscoflare(token, request, {
    report,
    verification: 'client',
    adminCapabilityKey: sessionSecret,
  })))
})
