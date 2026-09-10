# Discoflare

Self-hosted team chat that runs on a Cloudflare account. One operator, many members, text plus optional realtime calls and huddles.

## Language

**Workspace**:
The single named space in a Discoflare installation. It owns the installation's members, roles, channels, and invites.
_Avoid_: Guild, server, team (in data), tenant

**Channel**:
A named stream inside the workspace. Type is `text`, `voice`, `thread`, or `dm`; visibility is `workspace` or `private`.
_Avoid_: Room, chat, conversation

**Channel Category**:
An ordered, collapsible sidebar group for workspace text and voice Channels. A Channel may be uncategorized. Direct Messages and Threads do not belong to Channel Categories.
_Avoid_: Folder, section as a separate data model, category as a Channel type

**Channel Member**:
A workspace member granted access to a private Channel. Direct Message participants are Channel Members, and Threads inherit access from their parent Channel.
_Avoid_: DM participant as a separate entity, channel role

**Mailbox**:
A private Channel that owns one workspace email address. Read access is represented by Channel membership; Mailbox access additionally grants `read`, `send`, or `manage`. A Mailbox stays out of the chat Channel list and appears in the separate Mail app.
_Avoid_: Separate mailbox message store, external inbox account

**Email Conversation**:
A Thread under a Mailbox Channel. Incoming and outgoing emails are Messages with protocol metadata; an Internal Note is an ordinary Message in the same Thread and is never sent outside the workspace.
_Avoid_: Email chain as a second conversation model, showing quoted replies as nested email chrome

**Direct Message**:
A private Channel among workspace members. Two members is 1:1; three to twenty-five is a group.
_Avoid_: Friend chat, private message, Group DM as a separate kind, DM voice channel

**Huddle**:
A live session in a workspace Channel or group Direct Message. It starts as audio and participants may turn on camera or share their screen. The parent conversation owns access and there is at most one active Huddle per conversation.
_Avoid_: Permanent audio room, meeting as a second conversation entity

**Call**:
The 1:1 Direct Message presentation of a live session. A Call rings the other participant; it uses the same lifecycle and RealtimeKit media plane as a Huddle.
_Avoid_: Separate call store, separate call permissions

**Scheduled Huddle**:
A D1-backed event attached to a Channel or Direct Message. At its start time it becomes ready and notifies eligible participants; the first participant starts the live session.
_Avoid_: Calendar as a separate product, scheduled RealtimeKit meeting as source of truth

**Voice channel**:
A legacy workspace Channel type retained for existing installations. New Channels are ordinary text Channels because every Channel can host a Huddle.
_Avoid_: Creating a new permanent voice-only taxonomy

**Thread**:
A child Channel of type `thread` hanging off a text or Direct Message Channel.
_Avoid_: Subchannel, comment thread as a different store

**User**:
A human identity known to Discoflare. A human User is `pending` before joining, `active` while admitted to the workspace, and `removed` after being kicked.
_Avoid_: Calling an Agent a User in product copy

**Member**:
An active workspace participant, human or Agent, as presented in workspace member lists. Every Member has one Role. In storage, both kinds share the `users` identity table so Messages, mentions, Channel membership, and audit references have one author key.
_Avoid_: User-in-server record, separate agent author system

**Agent**:
An AI Member with a profile, a stateful coordinator Durable Object, and isolated Think memory per Channel, Thread, and Task Run. An Agent has no login credentials or human browser session. Its model defaults to Workers AI. Public-web reading uses Cloudflare Browser Run. A Linux Computer is an optional later connection: files live in the Agent Durable Object and command execution uses a Container.
Only an Owner, Admin, or custom Role with the Manage workspace Grant may discover, invoke, steer, approve, reject, stop, or configure Agents through chat. A custom Role with Manage tasks may assign Agents to and run Tasks without receiving Agent configuration secrets.
_Avoid_: Bot, external runner, Hermes profile, always-running VM, requiring Computer before chat

**Agent Browser**:
The public-web connection for an Agent. It renders a URL through Cloudflare Browser Run Quick Actions and returns markdown, a screenshot stored in R2, or links. It is not a search engine, carries no workspace or member cookies, and cannot log in or click.
_Avoid_: Perplexity, Brave Search, sharing a human browser, Puppeteer on a member device

**Task Board**:
An ordered, archivable collection of Tasks and Labels shared by the workspace and stored in D1.
_Avoid_: Agent-local todo list, queue as product language

**Task**:
A unit of workspace work with an ordered status, priority, due date, Labels, dependencies, checklist, Attachments, optional assigned Agent, optional report Channel, and durable result. Humans and Agents may create Tasks.
_Avoid_: Workflow (that is the execution primitive), prompt

**Database**:
A human-managed collection of structured Records in the workspace. A Database has an ordered custom schema made from typed Fields and is stored as logical product data inside the installation D1.
_Avoid_: A separately provisioned D1 database, spreadsheet, Task Board

**Database Field**:
A named typed property in a Database. Scalar Fields map to bounded internal text, number, boolean, date, or select storage slots; the internal slot name is never product language or part of the public API.
_Avoid_: Dynamically altering D1 for each Field, exposing `text_1` or another slot to people

**Database Record**:
One titled row in a Database with values addressed by Database Field identity. Record versions prevent a stale browser from silently overwriting a newer edit.
_Avoid_: Generic Item, Task unless it has Task execution semantics

**Database View**:
A shared, named lens over one Database. A View owns its table, board, calendar, or list layout plus visible Fields, typed filters, sorts, and any grouping or date Field. It never copies Records or exposes their physical storage slots.
_Avoid_: A second Database, a private browser preference, saving free-form SQL

**Data Bookmark**:
A private, ordered shortcut that one human keeps to a Database View, Document, or Canvas. Bookmarks are durable across that person's devices but do not reorganize the shared workspace for anyone else.
_Avoid_: A shared navigation category, browser-local state, a copied Data resource

**Document**:
A human-managed rich-text knowledge item in the Data app. Documents are versioned workspace state stored in the installation D1.
_Avoid_: Attachment, Message, external document provider

**MCP Access Token**:
A revocable credential created by the workspace Owner for an MCP client. It authorizes the built-in `/mcp` endpoint as the issuing Member, is constrained by explicit MCP scopes and the Member's current Role Grants, and is shown only once because D1 retains only its digest.
_Avoid_: Browser session, Cloudflare API token, permanent integration secret, direct D1 access

**Canvas**:
A human-managed spatial surface in the Data app containing positioned Canvas Items and Connections. The Canvas, its Items, and its Connections are durable workspace state in the installation D1.
_Avoid_: Whiteboard service, image file, using a Durable Object as the source of truth

**Canvas Item**:
A movable note or text card on a Canvas. It owns its content, geometry, color, and edit version; a Connection relates two Items without embedding either one.
_Avoid_: Database Record, Task, free-form untyped blob

**Task Run**:
One durable, cancellable execution attempt for a Task. It snapshots the Task and Agent launch configuration, retains progress and outcome history, and can be reconciled with its Cloudflare Workflow after an interruption. The assigned Agent Durable Object owns reasoning memory and Computer files; the Container backend owns only active processes.
_Avoid_: Treating a Task and its retryable execution as the same record

**Agent Computer**:
The durable filesystem and execution facade assigned to one Agent. Files live in the Agent Durable Object; a replaceable Container backend executes Linux commands against them and may sleep between operations.
_Avoid_: Permanent VM, implying the container process runs forever

**Role**:
Named reusable set of workspace Grants assigned to Members. Owner, Admin, and Member are protected system Roles; operators may add custom Roles.
Owner and Admin receive every Grant. Member is chat-only by default: it may send Messages, attach files, and start Huddles, but it cannot see or operate workspace settings, Agent configuration, Task Boards, Tasks, or Task Runs. Administrative access may be delegated only by assigning an explicit custom Role Grant.
_Avoid_: Rank, group

**Grant**:
A workspace permission included in a Role. A Member receives the Grants held by their assigned Role; the workspace owner always has every Grant.
_Avoid_: Capability, privilege

**Invite**:
A code that grants membership in the workspace with the default member role.
_Avoid_: Link (alone), invite URL as the entity

**Registration Mode**:
The installation-wide admission policy. `open` makes a newly authenticated User an active Member; `invite_only` keeps a new User pending until they accept an Invite.
_Avoid_: Hiding signup UI as the policy, workspace visibility

**Owner Setup Claim**:
The private, deployment-issued permission for the intended Owner email to create the first account on the new workspace origin. It stops working as soon as the `main` Workspace exists; it is not an open first-user race or a reusable Invite.
_Avoid_: First user wins, installer password, permanent setup token

**Discoflare Admin**:
The single small Worker that discovers and operates every Discoflare Installation in one Cloudflare account. It authenticates its operator through Cloudflare OAuth and keeps a stateless encrypted session cookie. It is an account-local control plane, not a workspace and not a hosted Discoflare service.
_Avoid_: Management mode, installer workspace, admin instance

**Account Admin Token**:
The account-owned Cloudflare credential an operator can create and paste directly into Discoflare Admin in Private Setup. It authorizes fixed installation, update, RealtimeKit, email, and repair operations in that Cloudflare account and is stored only as an Admin Worker secret.
_Avoid_: Instance Admin Token, installer token, workspace token

**Managed Admin OAuth Credential**:
The renewable Cloudflare OAuth credential stored only as encrypted Discoflare Admin Worker secrets by Managed Setup. It authorizes the same fixed infrastructure operations as a Private Setup Account Admin Token. Cloudflare does not expose Account API Tokens Write to OAuth clients, so it cannot mint an account-owned token.
_Avoid_: Installer token, login token, workspace OAuth

**Installer OAuth Session**:
The short-lived Cloudflare OAuth access credential held by discoflare.com during Admin bootstrap or repair. Managed Setup transfers the accompanying renewable credential into Admin, then discards the website session. Private Setup retains no renewable credential.
_Avoid_: Admin login session, hosted runtime token, workspace OAuth

**Installation Capability**:
A narrow per-Installation secret derived by Discoflare Admin and stored in that workspace Worker. It authenticates only the fixed internal operations exposed through the Admin service binding and is not general Cloudflare API authority.
_Avoid_: Account Admin Token, Member Grant, MCP Access Token

**Bootstrap Installer**:
The flow on discoflare.com that creates or repairs Discoflare Admin. Managed Setup installs its renewable OAuth credential and immediately asks Admin to create the first base Installation; Private Setup leaves Account Admin Token connection and workspace creation to the operator. Neither flow creates a Cloudflare Access application.
_Avoid_: Hosted control plane, workspace installer, runtime proxy

**Base Installation**:
The first usable workspace profile created on `workers.dev` with D1, R2, KV, core Durable Objects, Workers AI, Browser Run, builtin invite-only authentication, and an Owner Setup Claim. Agent Computer, Huddles, custom domain, and email are not enabled until the Owner requests them from Workspace Settings.
_Avoid_: Trial workspace, incomplete installation, free workspace

**Login Method**:
An owner-enabled way to authenticate: email, GitHub, X, or Telegram. A method is effective only when its required credentials or bindings are also available.
_Avoid_: Provider credentials as workspace data, enabled UI button as backend authorization

**Onboarding Revision**:
An immutable, owner-published bundle of Terms, Privacy policy, and Workspace rules. A new User accepts the current revision before open admission or Invite acceptance; publishing a later revision does not interrupt existing Members.
_Avoid_: External policy URL, mutable acceptance, forcing existing Members to re-accept

**Message**:
A chat or email event in a Channel containing written content, Attachments, or both. A recorded audio message is a Message with an audio Attachment, not a Huddle. Email-specific sender, recipient, threading, and delivery fields live in a companion record; Internal Notes need none.
_Avoid_: Post, comment

**Attachment**:
A file shared with a Message, including a recorded audio clip.
_Avoid_: Upload, blob (in product language)

**Presence**:
A Member's ephemeral online, idle, or offline state.
_Avoid_: User status, membership status, availability

**Push Subscription**:
A Member's opt-in browser endpoint for mentions, Direct Messages, and newly started Huddles. It belongs to one browser installation, not to the Member profile globally.
_Avoid_: Notification permission as a workspace Role, VAPID endpoint as a public URL
