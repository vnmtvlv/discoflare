import type { DeployProgressEvent, DeployProgressStep } from '@discoflare/installer-core'

export type DeployProgress = Extract<DeployProgressEvent, { type: 'progress' }>

export const deployProgressSteps: DeployProgressStep[] = [
  'account',
  'release',
  'installation',
  'management',
  'storage',
  'database',
  'assets',
  'access',
  'worker',
  'domain',
  'mail',
  'realtimekit',
  'computer',
  'schedule',
  'verify',
]

const labels: Record<DeployProgressStep, string> = {
  account: 'Account',
  release: 'Release',
  installation: 'Installation',
  management: 'Management',
  storage: 'Storage',
  database: 'Database',
  assets: 'Assets',
  access: 'Sign-in',
  worker: 'Worker',
  domain: 'Domain',
  mail: 'Mail',
  realtimekit: 'Huddles',
  computer: 'Computer',
  schedule: 'Schedule',
  verify: 'Verify',
}

export function deployProgressLabel(step: DeployProgressStep) {
  return labels[step]
}

export function deployProgressDetail(event: DeployProgress | null) {
  if (!event) return 'Starting'
  const label = deployProgressLabel(event.step)
  return event.detail ? `${label} — ${event.detail}` : label
}

export function deployProgressPercent(event: DeployProgress | null) {
  if (!event) return 4
  const index = deployProgressSteps.indexOf(event.step)
  if (index < 0) return 8
  const complete = event.state === 'complete' ? 1 : 0
  return Math.min(100, Math.round(((index + complete) / deployProgressSteps.length) * 100))
}
