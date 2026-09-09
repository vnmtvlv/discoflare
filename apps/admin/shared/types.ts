import type { CloudflareInstallation, CloudflareZone, DeployRequest } from '@discoflare/installer-core'

export type AdminSession = {
  accountId: string
  accountName: string
  email: string
  tokenConnected: boolean
  tokenTemplateUrl: string
  latestVersion: string | null
}

export type InstallationList = {
  installations: CloudflareInstallation[]
  zones: CloudflareZone[]
  latestVersion: string | null
}

export type InstallationMutation = {
  request: DeployRequest
}
