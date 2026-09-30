/** Bindings of a Discoflare Admin Worker. admin-core creates them; see `adminBindings`. */
export type AdminEnv = {
  ADMIN_DB: D1Database
  ASSETS?: Fetcher
  COORDINATOR: DurableObjectNamespace
  /** Encrypts stored credentials and signs nothing else. */
  ADMIN_SECRET: string
  ADMIN_WORKER_NAME?: string
  CLOUDFLARE_ACCOUNT_ID: string
  CLOUDFLARE_OAUTH_CLIENT_ID?: string
  /** Handed over once at deploy; the Admin moves it into its own storage and rotates it. */
  CLOUDFLARE_OAUTH_REFRESH_TOKEN?: string
  /** One-time owner claim, or a recovery claim set later with `wrangler secret put`. */
  ADMIN_CLAIM_TOKEN?: string
  DISCOFLARE_VERSION?: string
  DISCOFLARE_DIRECTORY_ENDPOINT?: string
  DISCOFLARE_DIRECTORY_ID?: string
  DISCOFLARE_DIRECTORY_TOKEN?: string
  /** Testing only: read releases from another manifest. */
  DISCOFLARE_RELEASE_MANIFEST?: string
}
