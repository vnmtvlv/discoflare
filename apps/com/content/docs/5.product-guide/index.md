---
title: Product guide
description: Understand the workspace, its apps, and the boundary between people, Agents, and Cloudflare infrastructure.
navigation: false
---

One Discoflare deployment creates one workspace. Members move between built-in apps without changing accounts or copying data into separate services.

## The workspace model

| Part | What it represents |
| --- | --- |
| Workspace | The membership, roles, settings, audit history, and shared data owned by one deployment. |
| App | A top-level workspace surface. The released apps are Chat, Tasks, Mail, and Databases. |
| Human member | A person with a sign-in identity, membership status, Role, and session. |
| Agent member | A configured AI participant with a model, instructions, permissions, conversation memory, and optional connections such as Browser Run or a Linux computer. It cannot sign in. |
| Integration | An optional external capability, such as RealtimeKit for Live sessions or an authentication provider. |

An app is not a separate deployment. Chat messages, Task records, Mail conversations, Database Records, members, and authorization facts live in the same D1 database; files and raw email live in the same protected R2 boundary.

## Choose a guide

- [Apps](/docs/product-guide/apps) explains Chat, Tasks, Mail, Databases, and what the app switcher does.
- [Agents](/docs/product-guide/agents) explains how to create an Agent, talk to it, and control its access.
- [Tasks](/docs/product-guide/tasks) explains boards and durable Agent runs.

## Shared authorization

The app switcher changes the surface, not the security boundary. Access is enforced by the Worker APIs, Durable Objects, and the member's effective permissions.

The default Member Role can chat, attach files, and start Live sessions. Administrative surfaces appear only when the member has the corresponding grant. In particular:

- **Manage workspace** controls Agent creation and configuration.
- **Manage tasks** controls Task boards, Task changes, assignment, and runs.
- Mailbox grants separately control who may read, send, or manage each Mailbox.

Hiding a button is only a convenience. The server repeats the authorization check for every protected operation.

## Storage boundary

Discoflare does not treat one storage service as the entire application:

- D1 stores durable workspace facts and history.
- R2 stores attachments, raw email, avatars, and large Agent artifacts.
- Agent Computer files live in the Agent Durable Object's SQLite storage.
- Durable Objects coordinate live conversations, presence, notifications, and Agent execution state.
- KV stores short-lived connection tickets.

See the [source architecture guide](https://github.com/vnmtvlv/discoflare/blob/main/docs/architecture.md) for request flows and Cloudflare bindings.
