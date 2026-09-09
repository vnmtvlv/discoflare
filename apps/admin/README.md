# Discoflare Admin

The account-local control plane for Discoflare. One small Worker, protected by Cloudflare Access, holds one Cloudflare account credential and manages every Discoflare installation in that account.

The managed installer transfers a renewable public-client OAuth grant into this Worker, then discards its hosted copy. The private installer bootstraps the same Worker with temporary OAuth and lets the operator paste an Account Admin Token directly on the Admin origin. Workspace Workers receive neither broad credential.

## Authority boundary

The Managed OAuth Grant or Account Admin Token can operate the account and zones selected during authorization. A dedicated Cloudflare account provides the strongest isolation. Workspace Workers receive only a service binding to Admin and a derived per-installation capability accepted by a fixed RealtimeKit operation allowlist.

Replacing the Admin credential also rotates those derived capabilities. Repair each managed installation from Admin after changing credentials.

## Development

```sh
pnpm install
pnpm --filter @discoflare/admin dev
```

Set local-only values in `.dev.vars` or `.env`; never commit Cloudflare credentials.

## Releases

Discoflare Admin is built from `apps/admin` and versioned with the workspace Worker. Each Discoflare GitHub Release publishes a separate Admin Worker bundle, static asset payload, and integrity manifest consumed by both setup modes on `discoflare.com`.

Admin normally updates itself from that manifest with its stored credential and preserves its credential and Access configuration. Either installer remains the recovery path when Admin is unavailable, outdated beyond compatibility, or no longer has working Cloudflare access.
