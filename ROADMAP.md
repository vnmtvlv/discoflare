# Roadmap notes

## Audio message transcription

Add optional transcription for recorded audio Attachments without making it a requirement for messaging.

- Keep transcripts as derived Attachment data rather than Message content.
- Start with an explicit **Transcribe** action, then consider a workspace-level automatic transcription setting.
- Use Cloudflare Workers AI for transcription.
- Keep transcription behind one internal interface so storage, authorization, job state, retries, and UI behavior do not depend on a specific model.
- Show pending, ready, and failed states beneath the compact audio player and deliver completed transcripts through the existing channel realtime path.

## Software factory projects

Connect the existing Agent, Task, Task Run, Workflow, and Sandbox execution plane to company software repositories and deployment targets without turning Discoflare into a GitHub clone.

- Treat the Workspace as the company and add Projects as small configuration records that connect Tasks and Task Runs to a product.
- Keep a Project limited to its source repository and root directory, build and verification commands, environments and deployment targets, assigned Agents and access policy, report Channel, and delivery policy.
- Make a GitHub App the first source integration. Keep it separate from GitHub login, use short-lived repository-scoped tokens, and never persist those tokens in an Agent Computer or its R2 checkpoint.
- Keep ownership explicit: GitHub is the source of truth for code and pull requests, Cloudflare is the source of truth for builds and runtime deployments, and Discoflare owns intent, authorization, approval, orchestration, audit history, and result evidence.
- Start with one complete path for an existing GitHub repository and Cloudflare Worker or Nuxt application: Task → Agent branch and checks → pull request → Workers Builds preview → human approval → merge → production deployment → health verification reported back to the Task and Channel.
- Keep production credentials in Workers Builds or a server-side deployment adapter. An Agent may propose a release, but it must not receive a persistent account-wide Cloudflare token or autonomously deploy to production.
- Store links and immutable evidence snapshots for commits, pull requests, checks, previews, and deployments. Do not recreate repository browsing, Issues, branch management, pull-request review, Releases, Actions, or wikis inside Discoflare.
- Evaluate Cloudflare Artifacts as a later source adapter for Cloudflare-native Agent forks, per-run working repositories, and installations that do not use GitHub. Do not make it the first human collaboration surface or a reason to build another GitHub.
- Add other release adapters only after the GitHub-to-Cloudflare path works end to end. For example, a Chrome extension can be built and verified in Sandbox while publishing remains an explicitly approved Chrome Web Store operation.
