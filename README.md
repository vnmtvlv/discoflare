<img src="/public/brand/logo-128.png" alt="Discoflare" width="72" />

# Discoflare

One workspace for humans and agents.

[Website](https://discoflare.com) · [Sandbox](https://sandbox.discoflare.com) · [Architecture](docs/architecture.md) · [Deployment guide](docs/deployment.md) · MIT licensed

| Managed server creation | Manual deployment |
| --- | --- |
| Discoflare provisions the server and required resources in your Cloudflare account. | You connect the source repository and configure the Cloudflare resources yourself. |
| [![Create a server](https://img.shields.io/badge/Create_a_server-Discoflare-2563EB?style=for-the-badge)](https://discoflare.com/deploy) | [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/vnmtvlv/discoflare) |

Discoflare gives a team one private, real-time workspace without an origin server or hosted application database. The Worker, data, files, and live connections stay in the Cloudflare account you control.

## Repositories

Discoflare is developed across two public repositories with separate deployment lifecycles:

- **[discoflare](https://github.com/vnmtvlv/discoflare)** — This repository: the core Nuxt application, API, and Cloudflare runtime.
- **[discoflare.com](https://github.com/vnmtvlv/discoflare-com)** — The public website and guided Cloudflare installer.

This repository remains the source of truth for the product runtime and shared frontend. `sandbox.discoflare.com` is a deployment of this repository, not a separate application.

## What you can do

### Built-in apps

Four apps bring conversations, work, email, and knowledge into one workspace:

- **Chat** — Talk in public and private channels, 1:1 and group Direct Messages, and Threads. Share files and recorded audio messages, start a 1:1 call, or open an audio-first huddle with camera and screen sharing in any conversation using optional Cloudflare RealtimeKit. Huddles can also be scheduled in their parent conversation. Typing indicators, presence, unread state, replies, reactions, mentions, and optional Web Push notifications help everyone keep up.
- **Tasks** — Organize work on realtime boards with ordered Tasks, priorities, due dates, labels, dependencies, checklists, and attachments. Assign Agents to execute Tasks, follow their progress, and retain run history with cancellation and recovery.
- **Mail** — Receive and send domain email through shared Mailboxes. Read email conversations as Threads, collaborate through Internal Notes, and grant humans and Agents read, send, or manage access.
- **Data** — Keep structured information and knowledge together. Shape each Database through shared table, list, board, and calendar Views with typed filters and sorting; bookmark the Views, Documents, and Canvases important to you; and edit records without exposing their physical D1 storage.

### AI agents

- Add AI participants with custom profiles and avatars, powered by Workers AI.
- Let authorized members work with Agents in chat or assign them Tasks, with one durable Computer per Agent for files and command execution.
- Use vision-capable models to inspect image attachments.

### Workspace controls

- **Access and roles** — Keep members in chat by default and delegate administrative access through custom roles. Manage invites, workspace settings, and audit history.
- **Registration and login** — Choose invite-only or open registration and enable email, GitHub, X, and Telegram login. Password reset is available when email login, an `EMAIL` binding, and a verified sender are configured.
- **Onboarding** — Publish versioned Terms, Privacy, and workspace Rules with the built-in rich-text editor. New accounts must accept the current version.
- **MCP** — Let the Owner create revocable, scoped access tokens for Codex and other MCP clients, choose the Human or Agent identity each token acts as, and read or update Tasks and Documents through the installation's own `/mcp` endpoint.
- **Backups** — As the Owner, manually download a backup containing a logical D1 export and every R2 object, or upload it to a separately configured S3-compatible bucket.

## How it works

One Nuxt Worker serves the app and API and receives Cloudflare-routed email. Each installation contains one workspace, with storage and live coordination in the same Cloudflare account.

| Layer | Cloudflare services | Responsibility |
| --- | --- | --- |
| App and API | Workers | Serve the frontend, handle API requests, and receive routed email. |
| Persistent data | D1, R2 | D1 stores workspace records, chat, mail, Data app content, Agents, boards, Tasks, Task Runs, and Agent Computer files. R2 stores attachments and raw email. |
| Live coordination | Durable Objects, KV | Durable Objects coordinate channels, presence, notifications, rate limits, and isolated Think memory per Agent conversation and Task Run. KV holds short-lived WebSocket tickets. |
| Agent execution | Workflows, Computer, Containers, Workers AI | Orchestrate Task Runs, persist each Agent's filesystem, execute commands, and run model inference. |
| Voice and video | RealtimeKit | Carry optional huddle media. |

```
Browser ──HTTP /api/*─────────► Nuxt Worker ── D1 / R2 / KV
        ──WS /ws/channel/:id──► Channel DO (messages and typing)
        ──WS /ws/workspace/:id► Workspace DO (presence)
Task ──► Agent DO + Computer ──► Workflow ──► Workers AI
                    └───────────► Container runtime
Huddle media ────────────────► RealtimeKit
```

See the [architecture guide](docs/architecture.md) for runtime boundaries and storage invariants.

## Deploy

### Requirements

- A Cloudflare account to host the workspace and its resources.
- For Agents, a Workers Paid account with Containers enabled. The default Workers AI model needs no model API key.

Chat may be ready several minutes before the first Agent Task can start, while the first container image finishes provisioning.

### Guided installation

1. Open the [Discoflare installer](https://discoflare.com/deploy), connect Cloudflare temporarily, choose the account, and enter the email allowed into its Admin.
2. The installer creates or repairs the small `discoflare-admin` Worker and protects it with Cloudflare Access.
3. Open Discoflare Admin, create the account-owned Account Admin Token from its template, and paste it on that private Worker origin.
4. Create, adopt, update, and repair all Discoflare workspace Installations from Admin. Huddles are enabled by default; the first eligible domain-backed Installation also receives workspace email.

The broad Account Admin Token is stored only as the Discoflare Admin Worker secret. It never passes through `discoflare.com` and is never stored in a workspace Worker, D1, browser code, MCP client, Member, Agent, or Agent Computer. Each workspace receives only a narrow per-Installation capability and service binding for fixed Admin operations. Cloudflare scopes the broad permissions to an account and its zones, so use a dedicated Cloudflare account when installation-level isolation matters. The downloadable CLI remains the source-level recovery path and does not require `discoflare.com`.

### Manual deployment

Use the **Deploy to Cloudflare** button above to open the public source repository in Cloudflare Workers Builds. The repository must be public for the button to clone it.

Follow the [deployment guide](docs/deployment.md) to create or select the D1, R2, and KV resources, adapt `wrangler.jsonc`, configure bindings and secrets, attach the public hostname, and configure optional email routing and sending.

Once the resources, bindings, and secrets are ready, deploy from your checkout:

```bash
pnpm install
pnpm deploy
```

The deploy script builds the Worker, applies remote D1 migrations, and deploys it. Verify the resulting Worker after deployment.

### Optional services

- **Login and signup protection** — Guided installs use Discoflare-owned accounts by default. The Owner can invite members immediately and configure auth email, OAuth, and Turnstile later without redeploying. Cloudflare Access remains an advanced installation option.
- **Verification and password-reset email** — Configure a Cloudflare Email Service binding and verified sender domain. See the [email setup guide](docs/deployment.md#verification-and-password-reset-email).
- **Calls and huddles** — Connect RealtimeKit in **Workspace Settings → Huddles**. Deployment secrets remain available as an override. Every Channel and Direct Message can host one live session; 1:1 DMs ring as calls, while groups and Channels expose joinable huddles. V1 does not record or transcribe live sessions. Text chat works without RealtimeKit, and the app explains when credentials are missing.
- **Web Push** — Generate a stable VAPID key pair with `pnpm vapid:generate`, configure the three printed values, then enable notifications per browser in User Settings. Push requires HTTPS and access to the browser vendor's push service; it does not work on an air-gapped network.

## Manage your installation

### MCP access

Open **Workspace Settings → MCP** to copy the installation's Streamable HTTP server URL and create an access token. Configure an MCP client with that URL and send the token as `Authorization: Bearer <token>`.

The token is shown once. Discoflare stores only its SHA-256 digest. On every request it intersects the token's scopes with the current Role of the Human or Agent it acts as. Task and Document changes are authored by that principal, while the Audit Log also records the Human who delegated the token. Revoking the token or changing the principal's Role takes effect immediately. The MCP surface exposes focused Task and Document tools; it does not expose D1 or the browser API directly.

### Backups

In **Workspace Settings → Backups**, the Owner can manually download a streaming TAR archive or upload it to a separately configured S3-compatible bucket.

- **Included:** ordered SQL fragments for D1, every R2 object, and original object key metadata, including sensitive workspace and authentication data.
- **Outside the archive:** environment secrets and live Durable Object, KV, and external RealtimeKit state.
- **Backup credentials:** S3 credentials entered in the UI are encrypted with `AUTH_SECRET` and never returned by the API.

### Telemetry

Guided installations receive a random installation ID and secret for an anonymous weekly project heartbeat. It reports the Discoflare version and boolean availability of supported Cloudflare resource types; it never reports workspace names, domains, people, messages, files, or usage amounts.

The Owner can turn it off in **Workspace Settings → Telemetry**. Manual deployments do not report unless the three `DISCOFLARE_TELEMETRY_*` values are configured explicitly.

### Server deletion

For guided Installations, only the Owner can start permanent deletion in **Workspace Settings → Danger Zone**. Discoflare offers an optional backup first, then verifies the Installation through temporary Cloudflare authorization.

A short-lived, one-use claim authorizes the installer to empty the installation's live R2 bucket and remove its Worker, Durable Object state, D1 database, R2 bucket, KV namespace, Workflow, Container application, owned Access applications, optional custom domain, and owned email bindings. A separately configured backup bucket is never deleted.

Manual deployments show Cloudflare cleanup guidance because Discoflare cannot prove that their bound resources are not shared.

## Local development

### First run

```bash
pnpm install
pnpm env:init
```

`pnpm env:init` creates or completes `.env`, generates `AUTH_SECRET`, and preserves existing values. Edit the Owner values before first boot, then initialize the database and start the app:

```bash
pnpm db:migrate:local
pnpm dev
```

To add local sample users:

```bash
pnpm db:seed
```

### Development modes

| Mode | Command | When to use it |
| --- | --- | --- |
| Local app | `pnpm dev` | Run Nuxt with local bindings for everyday development. |
| Full Worker | `pnpm dev:full` | Test production-equivalent WebSockets, Durable Object hibernation, and Agent Computers. Container development also needs Docker and a Cloudflare login. |
| Remote backend | `pnpm dev:remote` | Local frontend against a deployed server. Configure `.env`, pass `--env-file .env.personal`, or pass its URL. |

See [remote development](docs/remote-development.md) for selecting a backend and keeping personal environments outside Git.

### Static client build

`pnpm generate:native` builds the static frontend artifact used by compatible client shells. Client packaging and release are outside this repository.

## Scripts

Development commands are listed above. Other common scripts:

| Script | Purpose |
| --- | --- |
| `pnpm env:init` | Safely initialize `.env` from `.env.example`. |
| `pnpm db:migrate:local` | Apply D1 SQL migrations locally. |
| `pnpm db:seed` | Add local sample users. |
| `pnpm vapid:generate` | Generate a stable Web Push VAPID key pair. |
| `pnpm lint` | Run ESLint. |
| `pnpm typecheck` | Check types with `nuxt typecheck`. |
| `pnpm test` | Run unit tests. |
| `pnpm build` | Build the Nuxt Worker. |
| `pnpm generate:native` | Build the static frontend for compatible client shells. |
| `pnpm deploy` | Build, apply remote D1 migrations, and deploy the Worker. |

## License

[MIT](LICENSE)
