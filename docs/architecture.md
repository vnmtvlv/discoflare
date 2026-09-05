# Architecture

```
Browser (Nuxt)
  HTTP  /api/*
  WS    /ws/channel/:channelId
  WS    /ws/workspace/:workspaceId
        │
        ▼
Nuxt/Nitro Worker
  Better Auth, admission policy, REST, email ingress, R2, RealtimeKit tokens
  ├─ D1          catalog + message history
  ├─ R2          FILES
  ├─ KV          TICKETS
  ├─ ChannelDO   live sockets, typing, huddle flag
  ├─ WorkspaceDO presence
  ├─ NotificationDO D1 outbox delivery + retries
  ├─ RateLimitDO per ip:/user:
  ├─ AgentDO      one coordinator + isolated Think facets
  ├─ Workflows    durable Task Runs
  ├─ Workers AI   default model inference
  └─ Sandbox      one stable computer identity per Agent
                    └─ /workspace checkpoint → R2

RealtimeKit
  huddle audio/video  ◄── participant token from Worker
```

## Rules

1. Live path ≠ storage path. A Channel DO serializes writes, persists to D1, then broadcasts.
2. D1 is history source of truth for messages, channel read cursors, users, access control, and owner-managed integration settings. RealtimeKit API tokens saved in Workspace Settings are AES-GCM encrypted with `AUTH_SECRET`; deployment credentials override them. Recorded audio is an ordinary Message Attachment stored in R2; it does not use RealtimeKit. File reads remain authenticated, and audio seeking uses single byte-range responses.
3. Workspace DO owns ephemeral presence and recipient-targeted unread signals. It derives online/idle state from visible WebSocket attachments, honors each client's activity-visibility preference, and fans out only message/read identifiers to authorized user sockets; presence and unread truth remain in D1, never on `users` or DO storage.
4. One Channel DO named `channel:<channelId>` and one Workspace DO named `workspace:main`. Typing is scoped to a Channel DO.
5. Huddle media never transits the Channel DO.
6. Single Worker. Durable Object classes are exported from `server/cloudflare-entry.ts`.
7. Better Auth owns identities and linked accounts. `users.status` owns workspace admission. Open registration materializes an active Member; invite-only registration materializes a pending User.
8. A login method is effective only when both its owner-controlled switch and credentials/capability are present. Deployment credentials override encrypted D1 credentials and are never editable through the app.
9. Web Push subscriptions and its delivery outbox live in D1. Message and huddle writes enqueue notification rows in the same D1 batch; `NotificationDO` uses alarms to deliver and retry without another Worker or process.
10. Agents are real Members in the shared author/access model, but never authentication identities. `users.kind` distinguishes humans from agents; only humans have Better Auth identities and sessions.
11. One top-level `DiscoflareAgent` coordinator is named `agent:<agentId>`. Each Channel or Thread gets a `DiscoflareThink` sub-agent with its own SQLite transcript; each Task Run gets a separate Think sub-agent. Conversation memory and concurrent task reasoning cannot leak across those facets.
12. The default Member Role is chat-only. Task reads and writes require `manageTasks`; Agent discovery, chat invocation, control, and configuration require `manageWorkspace`. Task managers receive only a redacted Agent assignment list. The UI hides unavailable administrative surfaces, but the Worker API and Durable Objects are the authorization boundary.
13. One Task Run maps to one Cloudflare Workflow instance. Chat turns use Think's durable FIFO submission ledger directly, including idempotent admission, cancellation, recovery, and approval continuation. D1 mirrors only workspace-visible active-turn state; Think remains authoritative for execution.
14. Terms, Privacy, and Workspace rules are one immutable onboarding revision in D1. Email and social signup record acceptance of the current revision before a pending User can become an active Member; later publications apply only to future admissions.
15. One Agent has one stable Sandbox id. A Sandbox Container is not a permanent VM: it sleeps after inactivity and its local disk may disappear. Before use Discoflare restores the last `/workspace` archive from R2; after mutating tools it writes a new archive to R2.
16. Default inference is Workers AI through the `AI` binding. A profile stores a model id, not a vendor key. The core architecture has no Hermes, OpenRouter Spawn, Neon, or external machine dependency.
17. A Mailbox is a private text Channel marked by `email_mailboxes`; an Email Conversation is its ordinary child Thread. Email messages extend `messages`, while Internal Notes remain plain Messages. D1 owns the searchable conversation facts, R2 owns raw MIME and attachment bytes, Email Routing invokes the same Worker, and `MAIL_EMAIL` sends new mail and replies. Agent mail tools treat external fields as untrusted data, use the same Mailbox grants as humans, and require durable human approval before external sending.
18. The installer OAuth token is temporary provisioning authority. Cloudflare custom-domain attachment, Email Routing, DNS, and Worker bindings persist after OAuth expires; the installed Worker does not retain the token. Daily mailbox and access changes are D1-only because one catch-all route rejects addresses that do not map to an enabled Mailbox.
19. A fresh installation is not ready until its deployment-selected Owner completes the private Owner Setup Claim on the workspace origin. The claim is random and single-use by state: normal signup is rejected before the `main` Workspace exists, and every setup attempt is rejected after the Owner and Workspace are created atomically.

## Email flow

```text
Internet email → Cloudflare Email Routing catch-all → Worker email handler
  → reject unknown address
  → raw MIME + attachments in R2
  → Mailbox Channel root Message + Email Conversation Thread in D1

New email/reply → mailbox send permission → MAIL_EMAIL binding → Internet
Internal note   → ordinary Message in the same Thread → workspace only
```

## Agent task flow

```
Human creates Task in D1
  → D1 atomically claims the Task and snapshots its Task and Agent configuration
  → Worker asks agent:<id> Agent DO to start
  → Agent coordinator opens an isolated Think facet for the run
  → Think facet creates Workflow with run id
  → Workflow marks Task Run running in D1
  → Think runs the model through Workers AI
  → tools execute in the Agent's Sandbox
  → Sandbox /workspace checkpoints to R2
  → Workflow records review/done/failed in D1 and clears the active-run claim
  → optional result Message is authored by the Agent
```

Only a Workflow can enter or leave `running`. Cancellation terminates the Workflow and restores the pre-run Task status; reconciliation repairs Task and Task Run state from the Workflow status after an interrupted request. Task mutations and live progress fan out through the Workspace DO.

The separation is intentional: D1 answers “what does the workspace believe?”, the Agent DO answers “what does this agent remember and coordinate?”, Workflow answers “where is this execution?”, Sandbox answers “where does code run?”, and R2 answers “which large bytes must survive?”.

## Agent chat flow

```text
Human mentions Agent, or sends a DM containing an Agent
  → Worker validates the Message and Channel membership in D1
  → Worker signals the agent:<id> coordinator
  → Coordinator routes to the Channel/Thread's isolated Think facet
  → Think durably queues one idempotent submission for that Message
  → Lifecycle hooks expose tool progress and stream one editable Agent Message
  → Risky actions park durably until an authorized Member approves or rejects them
  → In a 1:1 DM, the facet creates/reuses a Thread rooted at that Message
```

Replies in that DM Thread keep addressing the same Agent without another mention. Workspace-channel mentions and group-DM replies remain in their source Channel. An Agent-authored Message does not recursively enter this routing path. Paused Agents are not addressed, and a mentioned Agent cannot cross a private Channel boundary it has not joined.

Image attachments are loaded from R2 only for the active turn and passed as inline model input when the selected Workers AI model supports vision. Binary image data is not persisted in the Think transcript. A text-only model is told that visual input was unavailable and must not claim that it inspected the image.

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

## Threads and reads

- A thread is a `channels.type = thread` child with one root message and its own Channel DO, messages, and read cursor.
- A thread inherits access from its parent channel; copied visibility is descriptive, not an authorization boundary.
- A channel is shown unread when either its own cursor or one of its thread cursors trails the latest message.
