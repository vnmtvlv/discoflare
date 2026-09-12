import type {
  CloudflareAccount,
  CloudflareInstallation,
  CloudflareZone,
  DiscoflareAdminBootstrapResponse,
  DeployProgressEvent,
  DeployProgressReporter,
  DeployProgressStep,
  DeployRequest,
  DeployResponse,
  InstallerAssetsPayload,
  InstallerReleaseManifest,
  ReleaseAsset,
} from '@discoflare/installer-core'

export type {
  CloudflareAccount,
  CloudflareInstallation,
  CloudflareZone,
  DiscoflareAdminBootstrapResponse,
  DeployProgressEvent,
  DeployProgressReporter,
  DeployProgressStep,
  DeployRequest,
  DeployResponse,
  InstallerAssetsPayload,
  InstallerReleaseManifest,
  ReleaseAsset,
}

export type InstallerHandoff = {
  accountId: string
  accountName: string
  origin: string
  workerName: string
  version: string
  handoffUrl: string
}

export type InstallerSessionResponse = {
  connected: boolean
  accounts: CloudflareAccount[]
  zones: CloudflareZone[]
  managedAdmins: Array<{
    accountId: string
    accountName: string
    origin: string
    workerName: string
    version: string
  }>
  handoff: InstallerHandoff | null
}

export type UninstallRequest = {
  accountId: string
  workerName: string
  origin: string
  confirmation: string
  claim: string
}

export type UninstallResponse = {
  origin: string
  deletedResources: string[]
  deletedObjects: number
  remainingResources: string[]
}
