import type { MailboxPermission } from './types'

export const MAIL_DOMAIN_ID = 'main'
export const MAIL_EXTERNAL_USER_ID = 'mail-external'

export function normalizeMailLocalPart(value: string): string {
  const localPart = value.trim().toLowerCase()
  if (!/^[a-z0-9](?:[a-z0-9.!#$%&'*+/=?^_`{|}~-]{0,62}[a-z0-9])?$/u.test(localPart)) {
    throw new Error('Mailbox must use a valid email local part')
  }
  return localPart
}

export function mailAddress(localPart: string, domain: string): string {
  return `${localPart}@${domain}`.toLowerCase()
}

export function mailPermissionAllows(actual: MailboxPermission, needed: MailboxPermission): boolean {
  const rank: Record<MailboxPermission, number> = { read: 1, send: 2, manage: 3 }
  return rank[actual] >= rank[needed]
}
