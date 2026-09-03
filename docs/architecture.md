# Architecture

```
Browser (Nuxt)
  HTTP  /api/*
  WS    /ws/channel/:channelId
  WS    /ws/guild/:guildId
        │
        ▼
Nuxt/Nitro Worker
  auth, REST, R2, RealtimeKit tokens
  ├─ D1          catalog + message history
  ├─ R2          FILES
  ├─ KV          SESSIONS
  ├─ ChannelDO   live sockets, typing, huddle flag
  ├─ GuildDO     presence
  └─ RateLimitDO per ip:/user:

RealtimeKit
  huddle audio/video  ◄── participant token from Worker
```

## Rules

1. Live path ≠ storage path. Broadcast first, persist with `waitUntil`.
2. D1 is history source of truth. Channel DO may keep a short ring; pagination hits D1.
3. Guild DO is presence only.
4. One Channel DO named `channel:<channelId>`, one Guild DO named `guild:<guildId>`.
5. Huddle media never transits the Channel DO.
6. Single Worker. Durable Object classes are exported from `server/cloudflare-entry.ts`.

## Local vs production

- `pnpm dev` — Nuxt + wrangler `getPlatformProxy` (D1/KV/R2; DO stubs via `wrangler.dev.jsonc`).
- `pnpm dev:full` / `pnpm preview` — `nuxt build && wrangler dev` (WebSockets + hibernation as in production).
- `pnpm deploy` — `nuxt build && wrangler deploy`.
