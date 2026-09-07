# Roadmap notes

## Audio message transcription

Add optional transcription for recorded audio Attachments without making it a requirement for messaging.

- Keep transcripts as derived Attachment data rather than Message content.
- Start with an explicit **Transcribe** action, then consider a workspace-level automatic transcription setting.
- Use Cloudflare Workers AI for transcription.
- Keep transcription behind one internal interface so storage, authorization, job state, retries, and UI behavior do not depend on a specific model.
- Show pending, ready, and failed states beneath the compact audio player and deliver completed transcripts through the existing channel realtime path.

## Software factory projects

Connect the existing Agent, Task, Task Run, Workflow, and Computer execution plane to company software repositories and deployment targets without turning Discoflare into a GitHub clone.

- Treat the Workspace as the company and add Projects as small configuration records that connect Tasks and Task Runs to a product.
- Keep a Project limited to its source repository and root directory, build and verification commands, environments and deployment targets, assigned Agents and access policy, report Channel, and delivery policy.
- Make a GitHub App the first source integration. Keep it separate from GitHub login, use short-lived repository-scoped tokens, and never persist those tokens in an Agent Computer or its R2 checkpoint.
- Keep ownership explicit: GitHub is the source of truth for code and pull requests, Cloudflare is the source of truth for builds and runtime deployments, and Discoflare owns intent, authorization, approval, orchestration, audit history, and result evidence.
- Start with one complete path for an existing GitHub repository and Cloudflare Worker or Nuxt application: Task → Agent branch and checks → pull request → Workers Builds preview → human approval → merge → production deployment → health verification reported back to the Task and Channel.
- Keep production credentials in Workers Builds or a server-side deployment adapter. An Agent may propose a release, but it must not receive a persistent account-wide Cloudflare token or autonomously deploy to production.
- Store links and immutable evidence snapshots for commits, pull requests, checks, previews, and deployments. Do not recreate repository browsing, Issues, branch management, pull-request review, Releases, Actions, or wikis inside Discoflare.
- Evaluate Cloudflare Artifacts as a later source adapter for Cloudflare-native Agent forks, per-run working repositories, and installations that do not use GitHub. Do not make it the first human collaboration surface or a reason to build another GitHub.
- Add other release adapters only after the GitHub-to-Cloudflare path works end to end. For example, a Chrome extension can be built and verified in an Agent Computer while publishing remains an explicitly approved Chrome Web Store operation.

## Generated workspace apps

Treat generated applications as a later platform direction, after Chat, Tasks, Mail, Data, Agents, and their internal APIs are reliable. The goal is not to regenerate those built-in apps. It is to let people and Agents create smaller applications inside an existing Workspace, where members, Roles, Channels, Tasks, Mailboxes, and Data already exist.

- Start with declarative views and workflows over bounded Discoflare APIs: dashboards, forms, approval queues, project views, support inboxes, and similar Workspace-specific tools.
- Give every app a manifest that declares its routes, storage, and requested access to specific Workspace resources. Installing an app must not grant raw D1, binding, secret, or account-wide Cloudflare access.
- Generate and test apps in an isolated Agent Computer, present a working preview before installation, and retain version, rollback, and uninstall boundaries.
- Require explicit human approval for external mutations and other consequential actions. An app may propose or simulate an action without receiving unrestricted authority to perform it.
- Keep application data ownership clear. Shared Discoflare records remain in their existing systems of record; app-private metadata may use a bounded app store without silently changing core schemas.
- Consider isolated executable Workers or facets only after the declarative model and capability boundary work. Do not adopt a multi-Worker runtime merely to match another product's architecture.

A hands-on Cloudflare OS Gadget experiment on 2026-09-06 used about 72,500 model tokens and cost about $0.42 to reach a partial Slack-like interface while still reporting seven captured errors and pending changes. Treat this as evidence that generation can produce a useful prototype quickly, but does not make collaboration semantics, authorization, realtime correctness, migrations, recovery, or product quality cheap.
