# Deployment

## One-click

```md
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/discoflare/discoflare)
```

Replace the repo URL with yours. `wrangler.jsonc` declares D1, R2, KV, and Durable Object classes so the button can provision them.

After deploy:

1. Set the owner (recommended):

```
wrangler secret put ADMIN_EMAIL
wrangler secret put ADMIN_PASSWORD
wrangler secret put ADMIN_NAME
```

Optional: `ADMIN_HANDLE` (used if `ADMIN_NAME` is empty), `ADMIN_WORKSPACE` (default `HQ`).

2. Open the Worker URL. Health runs D1 migrations and, if the catalog is empty, creates the owner from those env vars.
3. Sign in. Or open `/setup` if you did not set admin env.
4. Optional huddles: `wrangler secret put` RealtimeKit values. Text chat does not need them.

Also:

```
pnpm db:migrate
```

(`wrangler d1 migrations apply discoflare --remote`) if you prefer applying SQL from `drizzle/migrations` yourself.

## Secrets

```
wrangler secret put ADMIN_EMAIL
wrangler secret put ADMIN_PASSWORD
wrangler secret put ADMIN_NAME
wrangler secret put AUTH_SECRET
wrangler secret put REALTIMEKIT_ACCOUNT_ID
wrangler secret put REALTIMEKIT_APP_ID
wrangler secret put REALTIMEKIT_API_KEY
wrangler secret put REALTIMEKIT_PRESET_VOICE
# optional
wrangler secret put REALTIMEKIT_API_SECRET
wrangler secret put REALTIMEKIT_PRESET_AV
```

Never put RealtimeKit secrets in the client bundle.

## Local

```
pnpm install
pnpm db:migrate:local
pnpm dev
```

Full realtime locally:

```
pnpm dev:full
```
