# Deployment

## One-click

```md
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/vnmtvlv/discoflare)
```

`wrangler.jsonc` declares D1, R2, KV, and Durable Object classes so the button can provision them. Cloudflare also reads `.env.example` and prompts for the required owner/auth secrets. The source repository must be public for this flow.

`APP_NAME` changes the name beside the hardcoded Discoflare logo and the browser title. `APP_TITLE` changes the login headline; use `\n` to split it across two lines. `APP_SUBTITLE` changes the supporting copy below it. These are public display values, not secrets.

For one-click deployment:

1. Enter `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, and `AUTH_SECRET` in the deploy form.
2. Open the resulting Worker URL. The first health request creates the owner and workspace when the database is empty.
3. Sign in. `/setup` reports readiness and never accepts owner credentials.
4. Configure RealtimeKit only if the workspace needs huddles; text chat works without it.

For a manual deployment, set the owner and auth secrets:

```
wrangler secret put ADMIN_EMAIL
wrangler secret put ADMIN_PASSWORD
wrangler secret put ADMIN_NAME
wrangler secret put AUTH_SECRET
```

Optional: `ADMIN_HANDLE` (used if `ADMIN_NAME` is empty), `ADMIN_WORKSPACE` (default `HQ`).

Then run `pnpm deploy`. It applies the D1 migrations through the `DB` binding and deploys the Worker.

### X sign-in

Create an OAuth 2.0 application in the [X Developer Portal](https://developer.x.com/), then add this callback URL:

```
https://your-domain.example/api/auth/callback/twitter
```

Set both secrets to enable the **Continue with X** button:

```
wrangler secret put TWITTER_CLIENT_ID
wrangler secret put TWITTER_CLIENT_SECRET
```

The callback origin must be the deployed workspace URL. `discoflare.com` is the separate marketing site, not an authentication callback host. New social identities remain pending until they accept a workspace invite; the login flow preserves the invite across X OAuth.

## Secrets

```
wrangler secret put ADMIN_EMAIL
wrangler secret put ADMIN_PASSWORD
wrangler secret put ADMIN_NAME
wrangler secret put AUTH_SECRET
wrangler secret put TWITTER_CLIENT_ID
wrangler secret put TWITTER_CLIENT_SECRET
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

Sandbox-backed development is documented separately in [Sandbox development](sandbox-development.md).
