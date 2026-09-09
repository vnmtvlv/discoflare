# Architecture

```
Browser (Nuxt)
  HTTP  /api/*
  WS    /ws/channel/:channelId
  WS    /ws/workspace/:workspaceId
        │
        ▼
Cloudflare Access (optional advanced outer perimeter)
        │ verified identity JWT
        ▼
Nuxt/Nitro Worker
  Access JWT or Better Auth, admission policy, REST, email ingress, R2, RealtimeKit tokens
  ├─ D1          catalog + message history + Data resources
  ├─ R2          FILES
  ├─ KV          TICKETS
  ├─ ChannelDO   live sockets, typing, huddle lifecycle and schedule alarms
  ├─ WorkspaceDO presence
  ├─ NotificationDO D1 outbox delivery + retries
  ├─ RateLimitDO per ip:/user:
  ├─ AgentDO      one coordinator + durable Computer + isolated Think facets
  ├─ Workflows    durable Task Runs
  ├─ Workers AI   default model inference
  └─ Container    replaceable Linux execution backend for Agent Computers

RealtimeKit
  huddle audio/video  ◄── participant token from Worker
```

## Rules

1. Live path ≠ storage path. A Channel DO serializes writes, persists to D1, then broadcasts.
2. D1 is history source of truth for messages, channel read cursors, users, access control, and owner-managed integration settings. RealtimeKit API tokens saved in Workspace Settings are AES-GCM encrypted with `AUTH_SECRET`; deployment credentials override them. Recorded audio is an ordinary Message Attachment stored in R2; it does not use RealtimeKit. File reads remain authenticated, and audio seeking uses single byte-range responses.
   User-created Databases, Documents, and Canvases are logical resources in this same D1, not separately provisioned Cloudflare databases. Database Fields allocate from bounded typed columns on `database_items`; APIs expose Field ids and types, never physical slot names. Shared Database Views store validated semantic Field references and the Worker compiles them into bound, paginated D1 queries. Private Data Bookmarks belong to one User. Documents store rich text, while Canvases keep positioned Items and Connections in normalized tables. Versions provide optimistic concurrency. Durable Objects are not the source of truth for Data resources.
3. Workspace DO owns ephemeral presence and recipient-targeted unread signals. It derives online/idle state from visible WebSocket attachments, honors each client's activity-visibility preference, and fans out only message/read identifiers to authorized user sockets; presence and unread truth remain in D1, never on `users` or DO storage.
4. One Channel DO named `channel:<channelId>` and one Workspace DO named `workspace:main`. Typing is scoped to a Channel DO.
5. Every non-Thread chat conversation may own at most one active live session. The Channel DO owns its ephemeral lifecycle and participant-presence projection; D1 owns Scheduled Huddles. A 1:1 Direct Message presents the session as a ringing Call, while a group DM or Channel presents it as a joinable Huddle. RealtimeKit is only the audio/video/screen-share media plane: media never transits the Channel DO, and its credentials and participant tokens never reach another Discoflare installation.
6. One workspace installation is a single Worker. Its Durable Object classes are exported from `server/cloudflare-entry.ts`. The account-local `discoflare-admin` control plane is a separate Worker built from `apps/admin`; it is not part of the workspace runtime or secret boundary.
7. Authentication has one deployment-selected mode. In `access` mode Cloudflare Access owns login and its email allow policy; the Worker verifies the Access JWT and maps it to an internal human identity. In `builtin` mode Better Auth owns identities and linked accounts. `users.status` and Roles remain the workspace authorization boundary in both modes.
8. A login method is effective only when both its owner-controlled switch and credentials/capability are present. Deployment credentials override encrypted D1 credentials and are never editable through the app.
9. Web Push subscriptions and its delivery outbox live in D1. Message and huddle writes enqueue notification rows in the same D1 batch; `NotificationDO` uses alarms to deliver and retry without another Worker or process.
10. Agents are real Members in the shared author/access model, but never authentication identities. `users.kind` distinguishes humans from agents; only humans map to either verified Access identities or Better Auth identities and sessions.
11. One top-level `DiscoflareAgent` coordinator is named `agent:<agentId>`. Each Channel or Thread gets a `DiscoflareThink` sub-agent with its own SQLite transcript; each Task Run gets a separate Think sub-agent. Conversation memory and concurrent task reasoning cannot leak across those facets.
12. The default Member Role is chat-only. Task reads and writes require `manageTasks`; Agent discovery, chat invocation, control, and configuration require `manageWorkspace`. Task managers receive only a redacted Agent assignment list. The UI hides unavailable administrative surfaces, but the Worker API and Durable Objects are the authorization boundary.
13. One Task Run maps to one Cloudflare Workflow instance. Chat turns use Think's durable FIFO submission ledger directly, including idempotent admission, cancellation, recovery, and approval continuation. D1 mirrors only workspace-visible active-turn state; Think remains authoritative for execution.
14. Terms, Privacy, and Workspace rules are one immutable onboarding revision in D1. Access, email, and social admissions record acceptance of the current revision before a pending User can become an active Member; later publications apply only to future admissions.
15. One Agent has one stable Computer owned by its `DiscoflareAgent` Durable Object. `@cloudflare/computer` keeps the filesystem in the Agent DO's SQLite storage, so reads and writes do not require a running container. A Container is a replaceable Linux execution backend and is never the source of durable Agent identity or files.
16. Default inference is Workers AI through the `AI` binding. A profile stores a model id, not a vendor key. The core architecture has no Hermes, OpenRouter Spawn, Neon, or external machine dependency.
17. A Mailbox is a private text Channel marked by `email_mailboxes`; an Email Conversation is its ordinary child Thread. Email messages extend `messages`, while Internal Notes remain plain Messages. D1 owns the searchable conversation facts and mailbox registry, while R2 owns raw MIME and attachment bytes. The primary workspace Worker owns the zone catch-all and Email Sending binding; the base release routes its own domain locally without another Worker. The workspace accepts or rejects the full mailbox address against D1. Agent mail tools treat external fields as untrusted data, use the same Mailbox grants as humans, and require durable human approval before external sending.
18. One Cloudflare account has one `discoflare-admin` control-plane Worker. Its broad credential is either a locally refreshed Managed OAuth Grant or a manually supplied Account Admin Token and is stored only there; every guided workspace receives a service binding and narrow per-Installation capability. Admin enables RealtimeKit by default and assigns the first eligible domain-backed Installation as Primary for the zone's mail route. Discoflare.com is never in the workspace or Huddle runtime path. Because Cloudflare permissions are account- and zone-scoped, a dedicated Cloudflare account is the effective isolation boundary.
19. A fresh Access installation becomes ready when the deployment-selected Owner email first arrives with a verified Access identity. A fresh builtin installation remains unavailable until that Owner completes the private Owner Setup Claim. Both paths create the Owner and Workspace atomically, and other identities cannot bootstrap the installation.
20. Data is human-managed workspace state. The `manageDatabases` Grant controls Database discovery, shared Views, schema and Record mutations, Documents, and Canvases; the default Member Role remains chat-only. Bookmark writes derive the User from the authenticated session and can change only that User's private shortcuts. The Data navigation index returns only lightweight resource and View metadata, while an active Database View, Document, or Canvas body loads on demand. Tasks and Mail remain purpose-built models rather than special cases of Data.
21. The same Nuxt Worker serves stateless Streamable HTTP MCP at `/mcp`. MCP Access Tokens are owner-issued, revocable credentials whose raw value is shown once and whose SHA-256 digest is stored in D1. A token names an active Human or Agent principal separately from the Human who created it. Every request resolves that principal's current Role Grants and intersects them with the credential's scopes. Browser, MCP, Agent, and Workflow writes reuse the same authorized Task and Document domain operations. Audit entries name the acting principal and retain credential, delegator, and Task Run attribution; no raw SQL or general browser-session bypass is exposed.

## Email flow

```text
Internet email → Cloudflare Email Routing catch-all → primary workspace Worker → local email handler
  → reject unknown address
  → raw MIME + attachments in R2
  → Mailbox Channel root Message + Email Conversation Thread in D1

New email/reply → mailbox send permission → primary workspace Worker → Email Sending → Internet
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
  → tools read and write the Agent DO's durable Computer filesystem
  → a risky command parks durably and appears on the Task Run for a task manager to approve or reject
  → command tools synchronize that filesystem with the Container backend and execute
  → Workflow records review/done/failed in D1 and clears the active-run claim
  → optional result Message is authored by the Agent
```

Only a Workflow can enter or leave `running`. Cancellation terminates the Workflow and restores the pre-run Task status; reconciliation repairs Task and Task Run state from the Workflow status after an interrupted request. Task mutations and live progress fan out through the Workspace DO.

The separation is intentional: D1 answers “what does the workspace believe?”, the Agent DO and Computer answer “what does this agent remember and keep?”, Workflow answers “where is this execution?”, Container answers “where does Linux code run?”, and R2 answers “which large workspace attachments must survive?”.

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
- A newly started Huddle notifies other active Members who can access its parent Channel or Direct Message; a 1:1 Call rings the other participant. A Scheduled Huddle uses a Channel DO alarm to become ready and notify eligible participants. Join, leave, and end events do not create push notifications.
- One outbox row targets one browser subscription. The `(event_id, subscription_id)` key makes producer retries idempotent; deterministic browser notification tags limit visible duplicates after at-least-once delivery.
- A `404` or `410` push-service response removes the expired subscription. Transient failures use bounded retry and a D1 lease.
- VAPID keys are deployment configuration and must remain stable. Subscription endpoints are capability URLs and must not appear in logs or APIs.

## Local vs production

- `pnpm dev` — Nuxt development server with locally simulated Cloudflare bindings.
- `pnpm dev:full` — built Worker in local Wrangler, including WebSockets and Durable Object hibernation.
- Agent Computer execution development additionally needs Docker and remote Workers AI access; container startup takes longer than ordinary Worker startup.
- `pnpm dev:remote` — local frontend with HTTP requests proxied to a selected deployment and WebSockets connected directly to it. Personal targets live in ignored env files; see [Remote development](remote-development.md).
- `pnpm deploy` — build, apply D1 migrations by binding name, then deploy.
- The weekly telemetry Cron is best-effort and owner-controlled. Its payload is limited to a random installation ID, release version, timestamp, and capability booleans; workspace data never crosses this boundary.

## Threads and reads

- A thread is a `channels.type = thread` child with one root message and its own Channel DO, messages, and read cursor.
- A thread inherits access from its parent channel; copied visibility is descriptive, not an authorization boundary.
- A channel is shown unread when either its own cursor or one of its thread cursors trails the latest message.
