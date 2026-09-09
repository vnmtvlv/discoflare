type DiscoflareNotificationStatus = 'prompt' | 'subscribed' | 'blocked' | 'error'

interface Window {
  __DISCOFLARE_EXTENSION__?: {
    requestServerAccess: (origin: string) => Promise<boolean>
  }
  __DISCOFLARE_NATIVE_NOTIFICATIONS__?: {
    status: () => Promise<DiscoflareNotificationStatus>
    enable: () => Promise<DiscoflareNotificationStatus>
    disable: () => Promise<void>
    setBadge: (count: number) => Promise<void>
    notify: (notification: { id: string; title: string; body: string; badge: number; url: string }) => Promise<void>
  }
}
