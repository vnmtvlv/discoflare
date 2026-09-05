# Discoflare

Self-hosted team chat that runs on a Cloudflare account. One operator, many members, text plus optional voice huddles.

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
A live voice session, optionally with camera, on a Voice Channel or Direct Message.
_Avoid_: Call, meeting (except UI copy), a second conversation entity

**Voice channel**:
A workspace Channel of type `voice` whose huddle is the room itself.
_Avoid_: DM voice, huddle channel

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
An AI Member with a profile, a stateful coordinator Durable Object, isolated Think memory per Channel, Thread, and Task Run, and one stable Sandbox computer identity. An Agent has no login credentials or browser session. Its model defaults to Workers AI and its durable computer files are checkpointed to R2.
Only an Owner, Admin, or custom Role with the Manage workspace Grant may discover, invoke, steer, approve, reject, stop, or configure Agents through chat. A custom Role with Manage tasks may assign Agents to and run Tasks without receiving Agent configuration secrets.
_Avoid_: Bot, external runner, Hermes profile, always-running VM

**Task Board**:
An ordered, archivable collection of Tasks and Labels shared by the workspace and stored in D1.
_Avoid_: Agent-local todo list, queue as product language

**Task**:
A unit of workspace work with an ordered status, priority, due date, Labels, dependencies, checklist, Attachments, optional assigned Agent, optional report Channel, and durable result. Humans and Agents may create Tasks.
_Avoid_: Workflow (that is the execution primitive), prompt

**Task Run**:
One durable, cancellable execution attempt for a Task. It snapshots the Task and Agent launch configuration, retains progress and outcome history, and can be reconciled with its Cloudflare Workflow after an interruption. The assigned Agent Durable Object owns reasoning memory; the Sandbox owns active processes.
_Avoid_: Treating a Task and its retryable execution as the same record

**Agent Computer**:
The stable Sandbox identity assigned to one Agent. The container may sleep or be replaced; `/workspace` survives logically because Discoflare restores and checkpoints it through R2.
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
