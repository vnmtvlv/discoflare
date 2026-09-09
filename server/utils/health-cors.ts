export function allowedAdminHealthOrigin(requestOrigin: string | undefined, configuredOrigin: string | undefined): string | null {
  if (!requestOrigin || !configuredOrigin) return null
  try {
    const configured = new URL(configuredOrigin)
    const requested = new URL(requestOrigin)
    if (
      configured.protocol !== 'https:'
      || configured.username
      || configured.password
      || configured.pathname !== '/'
      || configured.search
      || configured.hash
      || requested.href !== `${requested.origin}/`
      || requested.origin !== configured.origin
    ) return null
    return configured.origin
  }
  catch {
    return null
  }
}
