# Deployment

## One-click

```md
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/vnmtvlv/discoflare)
```

`wrangler.jsonc` declares D1, R2, KV, and Durable Object classes so the button can provision them. Cloudflare also reads `.env.example` and prompts for the required owner/auth secrets. The source repository must be public for this flow; the current private repository is for development only.

After deploy:

1. If you did not use the deploy form, set the owner and auth secret:

```
wrangler secret put ADMIN_EMAIL
wrangler secret put ADMIN_PASSWORD
wrangler secret put ADMIN_NAME
wrangler secret put AUTH_SECRET
```

Optional: `ADMIN_HANDLE` (used if `ADMIN_NAME` is empty), `ADMIN_WORKSPACE` (default `HQ`).

2. Run `pnpm deploy`. It applies the D1 migration using the `DB` binding and deploys the Worker.
3. Open the Worker URL. Health creates the owner from those env vars when the database is empty.
4. Sign in. `/setup` is a readiness page and never accepts owner credentials.
5. Optional huddles: `wrangler secret put` RealtimeKit values. Text chat does not need them.

Also:

```
pnpm db:migrate
```

(`wrangler d1 migrations apply DB --remote`) if you prefer applying SQL from `drizzle/migrations` yourself.

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
pnpm env:init
pnpm db:migrate:local
pnpm dev
```

Full realtime locally:

```
pnpm dev:full
```
