import type { CloudflareInstallation, CloudflareZone, DeployRequest } from '@discoflare/installer-core'

export type AdminSession = {
  accountId: string
  accountName: string
  email: string
  tokenConnected: boolean
  credentialMode: 'managed-oauth' | 'account-token' | 'none'
  tokenTemplateUrl: string
  version: string | null
  latestAdminVersion: string | null
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
