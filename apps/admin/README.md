# Discoflare Admin

The account-local control plane for Discoflare. One small Worker, protected by Cloudflare Access, holds one Account Admin Token and manages every Discoflare installation in that Cloudflare account.

The public installer on `discoflare.com` bootstraps or repairs this Worker with temporary OAuth. Workspace Workers never receive the Account Admin Token.

## Authority boundary

The Account Admin Token can operate the account and zones selected in its Cloudflare token policy. A dedicated Cloudflare account provides the strongest isolation. Workspace Workers receive only a service binding to Admin and a derived per-installation capability accepted by a fixed RealtimeKit operation allowlist.

Rotating the Account Admin Token also rotates those derived capabilities. Repair each managed installation from Admin after replacing the token.

## Development

```sh
pnpm install
pnpm --filter @discoflare/admin dev
```

Set local-only values in `.dev.vars` or `.env`; never commit Cloudflare credentials.

## Releases

Discoflare Admin is built from `apps/admin` and versioned with the workspace Worker. Each Discoflare GitHub Release publishes a separate Admin Worker bundle, static asset payload, and integrity manifest consumed by the temporary OAuth bootstrap on `discoflare.com`.
