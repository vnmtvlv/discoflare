export type InstallationHeartbeat = {
  schemaVersion: 1
  installationId: string
  version: string
  sentAt: string
  capabilities: {
    d1: boolean
    r2: boolean
    kv: boolean
    customDomain: boolean
    email: boolean
    agents: boolean
    huddles: boolean
  }
}

export type CommunityStats = {
  available: boolean
  generatedAt: string
  installations: number
  activeInstallations: number
  workerDeployments: number
  databases: number
  buckets: number
  domains: number
}
