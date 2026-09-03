export const DEFAULT_APP_NAME = 'Discoflare'
export const DEFAULT_APP_TITLE = 'One workspace for humans, agents, and tasks.'
export const DEFAULT_APP_SUBTITLE = 'Built on your Cloudflare stack.'

type AppBrandingEnv = {
  APP_NAME?: string
  APP_TITLE?: string
  APP_SUBTITLE?: string
}

function normalizedName(value: string | undefined) {
  return value?.trim().replace(/\s+/g, ' ').slice(0, 80) || DEFAULT_APP_NAME
}

function normalizedTitle(value: string | undefined) {
  return value?.trim().replace(/\\n/g, '\n').slice(0, 160) || DEFAULT_APP_TITLE
}

function normalizedSubtitle(value: string | undefined) {
  return value?.trim().replace(/\s+/g, ' ').slice(0, 240) || DEFAULT_APP_SUBTITLE
}

export function readAppBranding(env?: AppBrandingEnv) {
  return {
    appName: normalizedName(env?.APP_NAME),
    appTitle: normalizedTitle(env?.APP_TITLE),
    appSubtitle: normalizedSubtitle(env?.APP_SUBTITLE),
  }
}
