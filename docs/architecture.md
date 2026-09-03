# Architecture

```
Browser (Nuxt)
  HTTP  /api/*
  WS    /ws/channel/:channelId
  WS    /ws/workspace/:workspaceId
        │
        ▼
Nuxt/Nitro Worker
  auth, REST, R2, RealtimeKit tokens
  ├─ D1          catalog + message history
  ├─ R2          FILES
  ├─ KV          TICKETS
  ├─ ChannelDO   live sockets, typing, huddle flag
  ├─ WorkspaceDO presence
  └─ RateLimitDO per ip:/user:

RealtimeKit
  huddle audio/video  ◄── participant token from Worker
```

## Rules

1. Live path ≠ storage path. A Channel DO serializes writes, persists to D1, then broadcasts.
2. D1 is history source of truth for messages, channel read cursors, users, and access control.
3. Workspace DO is presence only. It derives online/idle state from WebSocket attachments; presence is never stored on `users`.
4. One Channel DO named `channel:<channelId>` and one Workspace DO named `workspace:main`. Typing is scoped to a Channel DO.
5. Huddle media never transits the Channel DO.
6. Single Worker. Durable Object classes are exported from `server/cloudflare-entry.ts`.

## Local vs production

- `pnpm dev` — Nuxt + wrangler `getPlatformProxy` (D1/KV/R2; DO stubs via `wrangler.dev.jsonc`).
- `pnpm dev:full` / `pnpm preview` — `nuxt build && wrangler dev` (WebSockets + hibernation as in production).
- `pnpm deploy` — build, apply D1 migrations by binding name, then deploy.

## Threads and reads

- A thread is a `channels.type = thread` child with one root message and its own Channel DO, messages, and read cursor.
- A thread inherits access from its parent channel; copied visibility is descriptive, not an authorization boundary.
- A channel is shown unread when either its own cursor or one of its thread cursors trails the latest message.
