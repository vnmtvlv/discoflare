export function installerOAuthError(code: unknown): string {
  if (typeof code !== 'string' || !code.trim()) return ''
  switch (code) {
    case 'access_denied':
      return 'Cloudflare authorization was cancelled.'
    case 'invalid_scope':
      return 'Cloudflare rejected a requested permission. Reconnect Cloudflare to repair Admin.'
    case 'oauth_state':
      return 'The Cloudflare login expired. Connect Cloudflare again.'
    case 'oauth_exchange':
      return 'Cloudflare did not accept the login code. Connect Cloudflare again.'
    case 'oauth_token':
      return 'Cloudflare did not return an access token.'
    case 'oauth_refresh_token':
      return 'Cloudflare did not return a refresh token. Connect Cloudflare again to retry the install.'
    default:
      return `Cloudflare connection was not completed (${code}).`
  }
}
