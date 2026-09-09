import type { H3Event } from 'h3'
import { installerOrigin } from './cloudflare-oauth'

export function assertInstallerMutation(event: H3Event) {
  const origin = getRequestHeader(event, 'origin')
  if (origin !== installerOrigin(event)) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid request origin' })
  }
}
