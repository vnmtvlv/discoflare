# Discoflare

Discoflare is a self-hosted team chat for custom domains and Cloudflare accounts. Text runs on Workers, Durable Objects, D1, and R2. Huddles use Cloudflare RealtimeKit.

MIT licensed. One Worker. No origin server.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/vnmtvlv/discoflare)

The deploy form asks for `AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_NAME`. The first health request applies the bootstrap and creates the owner and workspace. `/setup` only reports readiness; it cannot be used to claim an unconfigured installation.

The repository must be public before the Deploy to Cloudflare button can clone it. It is safe to keep private while developing locally.

## Local

```
pnpm install
pnpm env:init
pnpm db:migrate:local
pnpm dev
```

WebSockets and Durable Object hibernation match production with:

```
pnpm dev:full
```

`pnpm env:init` creates or completes `.env` from `.env.example`, generates `AUTH_SECRET`, and preserves existing values. Edit the owner values before first boot. Optional extra seed users (`owner@local.test` / `member@local.test`, password `password12`):

```
pnpm db:seed
```

## Deploy

```
pnpm deploy
```

Optional huddles (text works without this):

```
wrangler secret put REALTIMEKIT_ACCOUNT_ID
wrangler secret put REALTIMEKIT_APP_ID
wrangler secret put REALTIMEKIT_API_KEY
wrangler secret put REALTIMEKIT_PRESET_VOICE
```

If secrets are missing, the huddle button explains how to add them. The app does not crash.

## Architecture

See [docs/architecture.md](docs/architecture.md).

```
Browser ──HTTP /api/*──► Nuxt Worker ── D1 / R2 / KV
        ──WS /ws/channel/:id──► ChannelDO (live text, typing, huddle flag)
        ──WS /ws/workspace/:id► WorkspaceDO (presence)
Huddle media ── RealtimeKit (token minted by Worker)
```

## Cost

Receive/text on Workers + D1 + Durable Objects is cheap. Paid Workers is recommended for production WebSockets.

RealtimeKit huddles are billed per participant-minute (voice is cheaper than A/V). Text works without RealtimeKit.

## Scripts

| Script | |
|---|---|
| `pnpm dev` | Nuxt + local bindings |
| `pnpm dev:full` | wrangler dev on the built Worker |
| `pnpm env:init` | safely initialize `.env` from `.env.example` |
| `pnpm deploy` | build + remote D1 migration + wrangler deploy |
| `pnpm db:migrate:local` | apply D1 SQL locally |
| `pnpm typecheck` | `nuxt typecheck` |
| `pnpm test` | unit tests |
