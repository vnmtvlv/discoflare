type DiscoflareNativeNotificationStatus = 'prompt' | 'subscribed' | 'blocked' | 'error'

interface Window {
  __DISCOFLARE_NATIVE_NOTIFICATIONS__?: {
    status: () => Promise<DiscoflareNativeNotificationStatus>
    enable: () => Promise<DiscoflareNativeNotificationStatus>
    disable: () => Promise<void>
    setBadge: (count: number) => Promise<void>
    notify: (notification: { id: string; title: string; body: string; badge: number; url: string }) => Promise<void>
  }
}
