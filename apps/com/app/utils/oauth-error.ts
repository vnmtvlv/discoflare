export function installerOAuthError(code: unknown): string {
  if (typeof code !== 'string' || !code.trim()) return ''
  switch (code) {
    case 'access_denied':
      return 'Cloudflare authorization was cancelled.'
    case 'invalid_scope':
      return 'Cloudflare rejected a requested permission. Use the private installer to repair Admin, then reconnect managed setup.'
    case 'oauth_state':
      return 'The Cloudflare login expired. Connect Cloudflare again.'
    case 'oauth_exchange':
      return 'Cloudflare did not accept the login code. Connect Cloudflare again.'
    case 'oauth_token':
      return 'Cloudflare did not return an access token.'
    case 'oauth_refresh_token':
      return 'Cloudflare did not return a refresh token. Use the private installer to repair Admin.'
    default:
      return `Cloudflare connection was not completed (${code}).`
  }
}
