# Architecture

```
Browser (Nuxt)
  HTTP  /api/*
  WS    /ws/channel/:channelId
  WS    /ws/workspace/:workspaceId
        │
        ▼
Nuxt/Nitro Worker
  Better Auth, admission policy, REST, R2, RealtimeKit tokens
  ├─ D1          catalog + message history
  ├─ R2          FILES
  ├─ KV          TICKETS
  ├─ ChannelDO   live sockets, typing, huddle flag
  ├─ WorkspaceDO presence
  ├─ NotificationDO D1 outbox delivery + retries
  ├─ RateLimitDO per ip:/user:
  ├─ AgentDO      one Think runtime per Agent
  ├─ Workflows    durable Task Runs and chat replies
  ├─ Workers AI   default model inference
  └─ Sandbox      one stable computer identity per Agent
                    └─ /workspace checkpoint → R2

RealtimeKit
  huddle audio/video  ◄── participant token from Worker
```

## Rules

1. Live path ≠ storage path. A Channel DO serializes writes, persists to D1, then broadcasts.
2. D1 is history source of truth for messages, channel read cursors, users, and access control. Recorded audio is an ordinary Message Attachment stored in R2; it does not use RealtimeKit. File reads remain authenticated, and audio seeking uses single byte-range responses.
3. Workspace DO owns ephemeral presence and recipient-targeted unread signals. It derives online/idle state from WebSocket attachments and fans out only message/read identifiers to authorized user sockets; presence and unread truth remain in D1, never on `users` or DO storage.
4. One Channel DO named `channel:<channelId>` and one Workspace DO named `workspace:main`. Typing is scoped to a Channel DO.
5. Huddle media never transits the Channel DO.
6. Single Worker. Durable Object classes are exported from `server/cloudflare-entry.ts`.
7. Better Auth owns identities and linked accounts. `users.status` owns workspace admission. Open registration materializes an active Member; invite-only registration materializes a pending User.
8. A login method is effective only when both its owner-controlled switch and credentials/capability are present. Deployment credentials override encrypted D1 credentials and are never editable through the app.
9. Web Push subscriptions and its delivery outbox live in D1. Message and huddle writes enqueue notification rows in the same D1 batch; `NotificationDO` uses alarms to deliver and retry without another Worker or process.
10. Agents are real Members in the shared author/access model, but never authentication identities. `users.kind` distinguishes humans from agents; only humans have Better Auth identities and sessions.
11. One `DiscoflareAgent` Durable Object is named `agent:<agentId>`. Think owns its SQLite-backed transcript, tool loop, recovery fibers, and workflow callbacks. D1 remains authoritative for Agent profiles and workspace-visible task state.
12. One Task Run maps to one Cloudflare Workflow instance. Each addressed chat message also maps to one reply Workflow. Workflows own retryable execution steps; the Agent DO owns reasoning; the Sandbox owns command execution. These are deliberately separate failure and retry boundaries.
13. One Agent has one stable Sandbox id. A Sandbox Container is not a permanent VM: it sleeps after inactivity and its local disk may disappear. Before use Discoflare restores the last `/workspace` archive from R2; after mutating tools it writes a new archive to R2.
14. Default inference is Workers AI through the `AI` binding. A profile stores a model id, not a vendor key. The core architecture has no Hermes, OpenRouter Spawn, Neon, or external machine dependency.

## Agent task flow

```
Human creates Task in D1
  → Worker asks agent:<id> Agent DO to start
  → Agent DO creates Workflow with run id
  → Workflow marks Task Run running in D1
  → Think runs the model through Workers AI
  → tools execute in the Agent's Sandbox
  → Sandbox /workspace checkpoints to R2
  → Workflow records review/done/failed in D1
  → optional result Message is authored by the Agent
```

The separation is intentional: D1 answers “what does the workspace believe?”, the Agent DO answers “what does this agent remember and coordinate?”, Workflow answers “where is this execution?”, Sandbox answers “where does code run?”, and R2 answers “which large bytes must survive?”.

## Agent chat flow

```text
Human mentions Agent, or sends a DM containing an Agent
  → Worker validates the Message and Channel membership in D1
  → Worker signals agent:<id> Agent DO
  → Agent DO starts one idempotent reply Workflow for that Message
  → Think reasons and may use the Agent's tools/computer
  → Workflow posts the reply as the Agent's normal workspace Message
```

An Agent-authored Message does not recursively enter this routing path. Paused Agents are not addressed, and a mentioned Agent cannot cross a private Channel boundary it has not joined.

## Notifications

- Workspace-channel and thread Messages notify only explicitly mentioned Members who can access the Channel. Direct Messages notify every other active participant.
- A newly started Huddle notifies other active Members who can access its Voice Channel or Direct Message. Join, leave, and end events do not notify.
- One outbox row targets one browser subscription. The `(event_id, subscription_id)` key makes producer retries idempotent; deterministic browser notification tags limit visible duplicates after at-least-once delivery.
- A `404` or `410` push-service response removes the expired subscription. Transient failures use bounded retry and a D1 lease.
- VAPID keys are deployment configuration and must remain stable. Subscription endpoints are capability URLs and must not appear in logs or APIs.

## Local vs production

- `pnpm dev` — Nuxt development server with locally simulated Cloudflare bindings.
- `pnpm dev:full` — built Worker in local Wrangler, including WebSockets and Durable Object hibernation.
- Agent Sandbox development additionally needs Docker and remote Workers AI access; container startup takes longer than ordinary Worker startup.
- `pnpm dev:sandbox` — temporary remote preview connected to the real pilot resources. It can mutate sandbox data; see [Sandbox development](sandbox-development.md).
- `pnpm deploy` — build, apply D1 migrations by binding name, then deploy.
- Docker Compose — one local Wrangler/Miniflare process owns the chat Worker and simulated bindings, persisted together in one volume. It is a single-node topology and must not be replicated. It does not provide the Cloudflare-only agent execution plane.

## Threads and reads

- A thread is a `channels.type = thread` child with one root message and its own Channel DO, messages, and read cursor.
- A thread inherits access from its parent channel; copied visibility is descriptive, not an authorization boundary.
- A channel is shown unread when either its own cursor or one of its thread cursors trails the latest message.
