<img src="/public/brand/logo-128.png" alt="Discoflare" width="72" />

# Discoflare

One workspace for humans and agents.

[Website](https://discoflare.com) · [Sandbox](https://sandbox.discoflare.com) · [Architecture](docs/architecture.md) · [Deployment guide](docs/deployment.md) · MIT licensed

| Managed server creation | Manual deployment |
| --- | --- |
| Discoflare provisions the server and required resources in your Cloudflare account. | You connect the source repository and configure the Cloudflare resources yourself. |
| [![Create a server](https://img.shields.io/badge/Create_a_server-Discoflare-2563EB?style=for-the-badge)](https://discoflare.com/deploy) | [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/vnmtvlv/discoflare) |

<p align="center">
  <img src="docs/screenshots/design-review-thread.jpg" alt="Discoflare design review with an image, reactions, and a live thread" width="100%" />
</p>

Discoflare gives a team one private, real-time workspace without an origin server or hosted application database. The Worker, data, files, and live connections stay in the Cloudflare account you control.

## What you can do

- Create public and private text channels.
- Chat in real time with Direct Messages, typing, presence, unread state, replies, threads, reactions, and mentions.
- Receive optional Web Push notifications for mentions, Direct Messages, and new huddles.
- Record audio messages or upload attachments to your own R2 bucket.
- Start voice huddles with Cloudflare RealtimeKit.
- Keep members in chat by default while Owner, Admin, or explicitly delegated custom roles manage invites, roles, workspace settings, and audit history.
- Control invite-only or open registration and enable email, GitHub, X, and Telegram login methods.
- Publish versioned Terms, Privacy, and workspace Rules with the built-in rich-text editor; new accounts must accept the current version.
- Offer password reset when email login, an `EMAIL` binding, and a verified sender are configured.
- Let workspace administrators create AI agents as participants, give them custom avatars, and use vision-capable Workers AI models to inspect image attachments.
- Manage realtime boards with ordered tasks, labels, dependencies, checklists, attachments, durable run history, cancellation, and recovery.
- Build human-managed Databases with typed custom fields, inline record editing, filtering, and sorting.
- Write rich Documents and arrange connected notes and text cards on Canvases in the same Data app.
- Receive and send domain email in shared Mailboxes, read conversations as chat Threads, add Internal Notes, and assign read, send, or manage access to humans and Agents.
- Download an owner-only manual backup containing a logical D1 export and every R2 object.

## How it works

One Nuxt Worker serves the app and API and receives Cloudflare-routed email. D1 stores shared workspace, chat, mail, Databases, Documents, Canvases, agent profiles, boards, Tasks, and Task Runs. R2 stores attachments, raw email, and agent-computer checkpoints. KV holds short-lived WebSocket tickets. Durable Objects coordinate live channels, presence, notification delivery, rate limits, and isolated Think memory for each Agent conversation and Task Run. Cloudflare Workflows orchestrate task runs; Cloudflare Sandbox containers execute commands; Workers AI performs inference. RealtimeKit carries huddle media and remains optional.

```
Browser ──HTTP /api/*─────────► Nuxt Worker ── D1 / R2 / KV
        ──WS /ws/channel/:id──► Channel DO (messages and typing)
        ──WS /ws/workspace/:id► Workspace DO (presence)
Task ──► Agent DO ──► Workflow ──► Workers AI
                    └───────────► Sandbox ──checkpoint──► R2
Huddle media ────────────────► RealtimeKit
```

## Deploy

Choose one of the two deployment paths above:

- **Managed server creation** opens the Discoflare installer. Connect Cloudflare, choose an account and domain, choose the Discoflare and email subdomains, and enter the intended owner email. The temporary OAuth grant provisions the Worker, storage, custom hostname, Email Routing, Email Sending, and the workspace mailbox in your Cloudflare account; the deployed Worker does not retain the Cloudflare API token.
- **Manual deployment** opens the public source repository in Cloudflare Workers Builds. You create or select the D1, R2, and KV resources, adapt `wrangler.jsonc`, configure bindings and secrets, attach the public hostname, configure optional email routing and sending, run migrations, and verify the resulting Worker yourself.

No model API key is required for the default Workers AI model.

Agents require a Workers Paid account with Containers enabled. The Worker becomes reachable before the first container image has finished provisioning, so chat may be ready several minutes before the first agent task can start. That is still one deploy and one Cloudflare account, but not an atomic instant rollout.

The installer returns a private one-time setup link on the new workspace domain. The intended owner sets their name and password there, so password managers associate the credential with the workspace instead of `discoflare.com`. The claim is random, carried in the URL fragment so it is not sent in the initial HTTP request, and becomes unusable once the owner and workspace are created. Normal signup is blocked until that happens. The source repository must be public before the deploy button can clone it.

Guided installations receive a random installation ID and secret for an anonymous weekly project heartbeat. It reports the Discoflare version and boolean availability of supported Cloudflare resource types; it never reports workspace names, domains, people, messages, files, or usage amounts. The owner can turn it off in **Workspace Settings → Telemetry**. Manual deployments do not report unless the three `DISCOFLARE_TELEMETRY_*` values are configured explicitly.

The owner can configure OAuth and Turnstile after signing in, without redeploying. Verification email needs a one-time Cloudflare Email Service binding and sender-domain setup. See the [deployment guide](docs/deployment.md).

The owner can create the same streaming TAR in two ways from **Workspace Settings → Backups**: download it to the current device, or upload it manually to a separately configured S3-compatible bucket. S3 credentials entered in the UI are encrypted with `AUTH_SECRET` and are never returned by the API. The archive contains ordered SQL fragments for D1 plus every R2 object and its original key metadata. It contains sensitive workspace and authentication data; environment secrets and live Durable Object, KV, and external RealtimeKit state remain outside it.

For managed installations, **Workspace Settings → Danger Zone** lets only the Owner start permanent server deletion. Discoflare first offers the optional backup screen, then verifies the installation through a temporary Cloudflare OAuth session. A short-lived, one-use claim authorizes the installer to empty only the installation's live R2 bucket before it removes the Worker, Durable Object state, D1 database, R2 bucket, KV namespace, Workflow, Container application, custom domain, and owned email bindings. A separately configured backup bucket is never deleted. Manually deployed Workers show Cloudflare cleanup guidance instead because Discoflare cannot prove that their bound resources are not shared.

After completing the manual Cloudflare resource, binding, and secret setup:

```bash
pnpm install
pnpm deploy
```

## Local development

```bash
pnpm install
pnpm env:init
pnpm db:migrate:local
pnpm dev
```

For production-equivalent WebSockets and Durable Object hibernation (and agent Sandbox development when Docker and a Cloudflare login are available):

```bash
pnpm dev:full
```

To run the current code against the disposable pilot environment, configure `.env.sandbox` and use `pnpm dev:sandbox`. This mutates the real sandbox resources; see the [sandbox development guide](docs/sandbox-development.md).

For frontend-only work against a deployed Discoflare backend, set `DISCOFLARE_DEV_PROXY_ORIGIN` in `.env` and use `pnpm dev:remote`. Native clients are packaged from this same frontend by the separate MIT-licensed `discoflare-clients` repository.

`pnpm env:init` creates or completes `.env`, generates `AUTH_SECRET`, and preserves existing values. Edit the owner values before first boot. To add local sample users:

```bash
pnpm db:seed
```

Text chat works without RealtimeKit. The owner can connect it in **Workspace Settings → Huddles**; deployment secrets remain available as an override. When credentials are absent, the app remains usable and explains the missing configuration.

Web Push is optional. Generate a stable VAPID key pair with `pnpm vapid:generate`, configure the three printed values, then enable notifications per browser in User Settings. Push needs HTTPS and access to the browser vendor's push service; it does not work on an air-gapped network.

## Scripts

| Script | |
|---|---|
| `pnpm dev` | Nuxt + local bindings |
| `pnpm dev:full` | wrangler dev on the built Worker |
| `pnpm dev:remote` | local frontend proxied to a deployed Discoflare server |
| `pnpm dev:sandbox` | remote preview against sandbox resources |
| `pnpm generate:native` | static native-client build for the Capacitor shell |
| `pnpm env:init` | safely initialize `.env` from `.env.example` |
| `pnpm vapid:generate` | generate a stable Web Push VAPID key pair |
| `pnpm deploy` | build + remote D1 migration + wrangler deploy |
| `pnpm db:migrate:local` | apply D1 SQL locally |
| `pnpm typecheck` | `nuxt typecheck` |
| `pnpm test` | unit tests |

## License

[MIT](LICENSE)
