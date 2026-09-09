import type { UninstallRequest, UninstallResponse } from '../../../shared/installer'
import { cloudflareClient, findDiscoflareInstallations, installationHostname, uninstallDiscoflare } from '@discoflare/installer-core'
import { requireCloudflareToken } from '../../utils/installer-session'
import { assertInstallerMutation } from '../../utils/installer-security'
import { recordInstallerDeletion } from '../../utils/telemetry-registry'

function parseRequest(value: unknown): UninstallRequest {
  const body = value as Partial<UninstallRequest> | null
  if (!body || typeof body !== 'object') throw createError({ statusCode: 400, statusMessage: 'Invalid uninstall request' })
  const accountId = String(body.accountId || '').trim()
  const workerName = String(body.workerName || '').trim()
  const hostname = installationHostname(body.origin)
  const origin = `https://${hostname}`
  const confirmation = String(body.confirmation || '').trim()
  const claim = String(body.claim || '').trim()
  if (!/^[0-9a-f]{32}$/u.test(accountId)) throw createError({ statusCode: 400, statusMessage: 'Cloudflare account is invalid' })
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(workerName)) throw createError({ statusCode: 400, statusMessage: 'Worker name is invalid' })
  if (confirmation !== origin) throw createError({ statusCode: 400, statusMessage: `Type ${origin} to confirm` })
  if (!/^[0-9a-f]{64}$/u.test(claim)) throw createError({ statusCode: 401, statusMessage: 'Open server deletion from Workspace Settings again' })
  return { accountId, workerName, origin, confirmation, claim }
}

export default defineEventHandler(async (event): Promise<UninstallResponse> => {
  assertInstallerMutation(event)
  const request = parseRequest(await readBody(event))
  const accessToken = await requireCloudflareToken(event)
  const client = cloudflareClient(accessToken)
  const account = await client.accounts.get({ account_id: request.accountId })
  if (account.id !== request.accountId) throw createError({ statusCode: 403, statusMessage: 'Cloudflare account is unavailable' })

  const matches = await findDiscoflareInstallations(accessToken, request.origin)
  const installation = matches.find(item => item.accountId === request.accountId && item.workerName === request.workerName)
  if (!installation || matches.length !== 1) {
    throw createError({ statusCode: 409, statusMessage: 'The selected Discoflare installation changed. Reload and verify it again.' })
  }
  const deleted = await uninstallDiscoflare(client, accessToken, installation, request.claim)
  try {
    await recordInstallerDeletion(event, request.accountId, request.workerName)
  }
  catch (error) {
    console.warn('Discoflare was deleted, but anonymous installation telemetry could not be removed', error)
  }
  return { origin: request.origin, ...deleted }
})
