import type { H3Event } from 'h3'

type InstallerBindings = Partial<Record<
  | 'NUXT_CLOUDFLARE_OAUTH_CLIENT_ID'
  | 'NUXT_CLOUDFLARE_OAUTH_CLIENT_SECRET'
  | 'NUXT_CLOUDFLARE_MANAGED_OAUTH_CLIENT_ID'
  | 'NUXT_INSTALLER_SESSION_PASSWORD'
  | 'NUXT_INSTALLER_ORIGIN'
  | 'NUXT_ADMIN_INSTALLER_MANIFEST_URL',
  string
>>

function bindings(event: H3Event): InstallerBindings {
  const context = event.context as typeof event.context & {
    cloudflare?: { env?: InstallerBindings }
  }
  return context.cloudflare?.env || {}
}

export function installerConfig(event: H3Event) {
  const runtime = useRuntimeConfig(event)
  const env = bindings(event)

  return {
    cloudflareOAuthClientId: env.NUXT_CLOUDFLARE_OAUTH_CLIENT_ID || runtime.cloudflareOAuthClientId,
    cloudflareOAuthClientSecret: env.NUXT_CLOUDFLARE_OAUTH_CLIENT_SECRET || runtime.cloudflareOAuthClientSecret,
    cloudflareManagedOAuthClientId: env.NUXT_CLOUDFLARE_MANAGED_OAUTH_CLIENT_ID || runtime.cloudflareManagedOAuthClientId,
    installerSessionPassword: env.NUXT_INSTALLER_SESSION_PASSWORD || runtime.installerSessionPassword,
    installerOrigin: env.NUXT_INSTALLER_ORIGIN || runtime.installerOrigin,
    adminInstallerManifestUrl: env.NUXT_ADMIN_INSTALLER_MANIFEST_URL || runtime.adminInstallerManifestUrl,
  }
}
