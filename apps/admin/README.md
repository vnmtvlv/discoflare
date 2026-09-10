# Discoflare Admin

The account-local control plane for Discoflare. One small Worker holds one Cloudflare account credential and manages every Discoflare installation in that account. Cloudflare OAuth authenticates the configured owner; Admin itself needs neither Cloudflare Access nor D1.

The managed installer stores its renewable OAuth credential as this Worker's encrypted secrets, asks Admin to create the first base workspace, then discards the website session. It does not create an account token. The private installer bootstraps the same Worker and lets the operator paste an Account Admin Token directly on the Admin origin. Workspace Workers receive neither broad credential.

## Authority boundary

The Managed OAuth credential or Account Admin Token can operate the account and zones selected during authorization. A dedicated Cloudflare account provides the strongest isolation. Workspace Workers receive only a service binding to Admin and a per-installation capability derived from Admin's stable session secret and accepted by fixed capability and RealtimeKit operation allowlists.

Replacing or refreshing the Admin credential does not rotate those derived capabilities. Rotating the Admin session secret requires repairing each managed installation from Admin.

## Development

```sh
pnpm install
pnpm --filter @discoflare/admin dev
```

Set local-only values in `.dev.vars` or `.env`; never commit Cloudflare credentials.

## Releases

Discoflare Admin is built from `apps/admin` and versioned with the workspace Worker. Each Discoflare GitHub Release publishes a separate Admin Worker bundle, static asset payload, and integrity manifest consumed by both setup modes on `discoflare.com`.

Admin normally updates itself from that manifest with its stored credential and preserves its credential and login configuration. Either installer remains the recovery path when Admin is unavailable, outdated beyond compatibility, or no longer has working Cloudflare access.
