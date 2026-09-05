interface Window {
  __DISCOFLARE_EXTENSION__?: {
    requestServerAccess: (origin: string) => Promise<boolean>
  }
}
