import type { AuthLoginMethod } from './types'

export const ACCOUNT_PROVIDERS = [
  { id: 'google', label: 'Google', icon: 'i-ph-google-logo' },
  { id: 'github', label: 'GitHub', icon: 'i-ph-github-logo' },
  { id: 'twitter', label: 'X', icon: 'i-ph-x-logo' },
  { id: 'telegram', label: 'Telegram', icon: 'i-ph-telegram-logo' },
  { id: 'linkedin', label: 'LinkedIn', icon: 'i-ph-linkedin-logo' },
] as const

export type AccountAuthSettings = {
  managed: boolean
  email: string | null
  emailVerified: boolean
  canAddEmail: boolean
  canSetPassword: boolean
  methods: Partial<Record<AuthLoginMethod, boolean>>
  accounts: Array<{ id: string, provider: string, enabled: boolean, canRemove: boolean }>
}
