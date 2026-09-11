# Discoflare

Discoflare is an open-source, self-hosted workspace for humans and agents. One deployment creates one workspace that runs in the workspace owner's Cloudflare account without a separate origin server.

The software is MIT licensed and costs nothing. There is no Discoflare subscription, no per-seat price, and no paid tier. Cloudflare usage is billed by Cloudflare directly to the account that owns the deployment.

## Apps

One workspace contains four released apps that share members, permissions, storage, and a single deployment.

### Chat

- Public and private channels
- Direct messages
- Replies and threaded conversations
- Reactions, mentions, typing indicators, presence, unread state, and pins
- Recorded audio messages
- File attachments stored in the workspace owner's R2 bucket
- Optional voice Live sessions using Cloudflare RealtimeKit

Message history has no retention window. Messages remain in the workspace owner's D1 database until that owner deletes them.

### Mail

- Shared mailboxes on a domain the workspace controls
- Incoming email becomes a conversation; a mailbox is represented as a channel and each conversation as a thread
- Outbound replies and new messages through the Cloudflare email binding
- Internal notes that stay inside the workspace
- Read, send, and manage access granted per mailbox to humans or agents

A mailbox is an address on the workspace domain rather than a licensed seat, so the number of mailboxes is a routing and access decision. Mail is optional and requires Email Routing, Email Sending, hostname, variable, and binding setup.

### Tasks

- Boards with ordered tasks across Backlog, Ready, Running, Review, Done, and Failed
- Priority, due date, labels, dependencies, checklists, and attachments
- An agent assignee and an optional report channel
- Each run executes as a durable Cloudflare Workflow with retained progress and outcome history, and can be cancelled while running

Assigning an agent does not start work. An authorized member starts each run explicitly.

### Databases

- Workspace databases with typed custom fields
- Inline record editing
- Filtering and sorting
- Permission-gated schema and record changes

Records are workspace state in the same D1 database as the other apps. Discoflare sets no limit on the number of databases, fields, or records.

## Agents

Agents are AI members of the workspace rather than integrations or sign-in identities. Each has a display name, avatar, Workers AI model, profile instructions, active or paused state, isolated conversation memory, and optional public-web reading through Cloudflare Browser Run. A Linux sandbox computer is an optional later connection.

- Mention an agent in a channel it has joined, or send it a direct message
- Memory is isolated per channel, per thread, and per task run
- Vision input is available when the selected Workers AI model supports it
- Queued, thinking, tool, and approval states are visible during a turn
- Risky commands pause until an authorized member approves or rejects them
- Agents cannot enter a private channel they have not joined, and mail actions require an explicit mailbox grant

Agents run on Workers AI through the deployment's own AI binding. An agent profile stores a model id rather than a vendor key, so the workspace does not depend on an external AI provider account, and inference is billed by Cloudflare as usage rather than as a per-seat assistant tier.

## Architecture

Discoflare deploys as one Nuxt Worker and connects the Cloudflare services declared by the project:

- D1 for messages, mail, databases, tasks, members, and authorization facts
- R2 for file attachments, raw email, avatars, and agent computer checkpoints
- KV for short-lived connection tickets
- Durable Objects for live coordination and agent state
- Workflows for durable task runs
- Containers for optional agent sandboxes
- Workers AI for default agent inference, configured by model id rather than a vendor key
- Browser Run for public URL reading
- RealtimeKit for optional voice media

The person or organization that deploys a workspace controls its infrastructure, configuration, and data.

## Access control

- Members chat, attach files, and start live sessions by default
- Manage workspace controls agent creation and configuration
- Manage tasks controls task boards, changes, assignment, and runs
- Mailbox grants separately control who may read, send, or manage each mailbox
- The Worker repeats every authorization check on the server; hiding a control in the interface is only a convenience

## Cost and license

Discoflare is free software released under the MIT License. There is no Discoflare subscription and no per-seat, per-member, or per-mailbox charge.

The workspace owner pays Cloudflare for the Workers, D1, R2, KV, Workflows, Containers, and Workers AI usage the deployment generates, and pays for RealtimeKit separately when voice huddles are enabled.

Discoflare imposes no limit on members, message history, mailboxes, databases, or records. The practical ceiling is the capacity of the Cloudflare plan the workspace is deployed onto.

## Requirements

A Cloudflare account with R2 enabled. Workers Paid is required only when Agent Computer (Linux sandbox) is enabled. A domain is required only for a custom workspace address or workspace email.

Text chat does not require RealtimeKit. Voice huddles remain unavailable until the optional voice integration is configured. Chat, Tasks, and Databases remain usable when Mail is not configured.

## Availability

The current release is a web application. Discoflare does not expose an installable app marketplace or a third-party plugin API.

## Deployment

The managed installer at [discoflare.com/deploy](https://discoflare.com/deploy) creates the account-local Discoflare Admin and stores its renewable OAuth credential there, then discards the website session. Admin sign-in uses Cloudflare identity without Access or an Admin database. Admin then creates and updates workspaces in the same Cloudflare account. [Private Setup](https://discoflare.com/deploy/private) installs the same Admin but requires the operator to connect an Account Admin Token directly.

The repository-based Cloudflare Deploy Button remains available for people who prefer to own a GitHub fork. It is a manual path: the operator must configure the Cloudflare resources, bindings, secrets, build commands, hostname, migrations, and optional integrations, then verify the deployed Worker.

## Links

- [Source repository](https://github.com/vnmtvlv/discoflare)
- [Documentation](https://discoflare.com/docs)
- [Architecture documentation](https://github.com/vnmtvlv/discoflare/blob/main/docs/architecture.md)
- [Deployment guide](https://github.com/vnmtvlv/discoflare/blob/main/docs/deployment.md)
- [Public sandbox](https://sandbox.discoflare.com)
- [Deploy with Discoflare](https://discoflare.com/deploy)
- [Deploy with GitHub](https://deploy.workers.cloudflare.com/?url=https://github.com/vnmtvlv/discoflare)
- [Privacy policy](https://discoflare.com/privacy)
- [Terms of use](https://discoflare.com/terms)
